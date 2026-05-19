import { v } from "convex/values";

import { canSeeAllProjects, requireCurrentPerson, requireLeadership, requireProjectAccess } from "./access";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, type MutationCtx, query } from "./_generated/server";

function projectSummaryText(p: Doc<"projects"> | (Omit<Doc<"projects">, "_id" | "_creationTime"> & { _id?: Id<"projects"> })) {
  return [
    p.name,
    p.funderName ? `Funder: ${p.funderName}` : "",
    p.summary ?? "",
    p.states?.length ? `States: ${p.states.join(", ")}` : "",
    typeof p.grantAmount === "number" ? `Grant: ₹${p.grantAmount}` : "",
    p.startDate || p.endDate ? `Dates: ${p.startDate ?? ""} → ${p.endDate ?? ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function scheduleProjectIngestion(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) return;
  await ctx.scheduler.runAfter(0, internal.aiIngest.upsertAndSchedule, {
    projectId,
    kind: "project_summary",
    sourceTable: "projects",
    sourceId: projectId,
    title: project.name,
    text: projectSummaryText(project),
  });
  if (project.mouStorageId) {
    await ctx.scheduler.runAfter(0, internal.aiIngestNode.extractStorageFile, {
      projectId,
      kind: "mou",
      sourceTable: "projects",
      sourceId: `${projectId}:mou`,
      storageId: project.mouStorageId,
      title: `${project.name} — MoU`,
    });
  }
  if (project.proposalStorageId) {
    await ctx.scheduler.runAfter(0, internal.aiIngestNode.extractStorageFile, {
      projectId,
      kind: "proposal",
      sourceTable: "projects",
      sourceId: `${projectId}:proposal`,
      storageId: project.proposalStorageId,
      title: `${project.name} — Proposal`,
    });
  }
}

export const listPortfolio = query({
  args: {},
  handler: async (ctx) => {
    const { person } = await requireCurrentPerson(ctx);
    const allProjects = await ctx.db.query("projects").collect();
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_person", (q) => q.eq("personId", person._id))
      .collect();
    const memberProjectIds = new Set(memberships.map((membership) => membership.projectId));
    const projects = canSeeAllProjects(person)
      ? allProjects
      : allProjects.filter(
          (project) =>
            project.programManagerId === person._id ||
            project.accountManagerId === person._id ||
            memberProjectIds.has(project._id),
        );

    return Promise.all(
      projects.map(async (project) => {
        const [deliverables, budgets, activities, reports, alerts] = await Promise.all([
          ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
          ctx.db.query("budgetCategories").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
          ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
          ctx.db.query("reports").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
          ctx.db.query("alerts").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ]);

        return {
          ...project,
          funderLogoUrl: project.funderLogoStorageId ? await ctx.storage.getUrl(project.funderLogoStorageId) : null,
          deliverables,
          budgets,
          activities,
          reports,
          alerts: alerts.filter((alert) => !alert.resolvedAt),
          nextReport: reports.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null,
          approvedBudget: budgets.reduce((total, row) => total + row.approvedAmount, 0),
          spentBudget: budgets.reduce((total, row) => total + row.spentAmount, 0),
          deliverablesDone: deliverables.filter((item) => item.status === "completed").length,
          deliverablesTotal: deliverables.length,
        };
      }),
    );
  },
});

export const createManual = mutation({
  args: {
    name: v.string(),
    funderName: v.string(),
    grantAmount: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    states: v.array(v.string()),
    summary: v.optional(v.string()),
    funderLogoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireLeadership(person);

    const now = Date.now();

    const id = await ctx.db.insert("projects", {
      ...args,
      status: "on_track",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleProjectIngestion(ctx, id);
    return id;
  },
});

export const createFromAiDraft = mutation({
  args: {
    draft: v.any(),
    programManagerId: v.optional(v.id("people")),
    accountManagerId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireLeadership(person);

    const now = Date.now();
    const draft = args.draft;
    // Normalise stateAllocations from the AI draft: drop zeros, renormalise.
    type AllocIn = { state?: unknown; fraction?: unknown };
    const rawAllocs: AllocIn[] = Array.isArray(draft.stateAllocations)
      ? (draft.stateAllocations as AllocIn[])
      : [];
    const cleanedAllocs: Array<{ state: string; fraction: number }> = rawAllocs
      .map((a) => ({
        state: String(a?.state ?? "").trim(),
        fraction: Number(a?.fraction ?? 0),
      }))
      .filter((a): a is { state: string; fraction: number } => Boolean(a.state) && a.fraction > 0);
    const allocTotal = cleanedAllocs.reduce((s: number, a) => s + a.fraction, 0);
    const stateAllocations = allocTotal > 0
      ? cleanedAllocs.map((a) => ({ state: a.state, fraction: a.fraction / allocTotal }))
      : undefined;

    const projectId = await ctx.db.insert("projects", {
      name: draft.projectName ?? "Untitled grant project",
      funderName: draft.funder?.name ?? draft.funderName ?? "Unknown funder",
      programManagerId: args.programManagerId,
      accountManagerId: args.accountManagerId,
      status: "on_track",
      grantAmount: Number(draft.grantAmount ?? 0),
      startDate: draft.startDate ?? "",
      endDate: draft.endDate ?? "",
      states: Array.isArray(draft.states) ? draft.states : [],
      stateAllocations,
      summary: draft.summary,
      extractedDraft: draft,
      funderLogoStorageId: draft.funderLogoStorageId,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of draft.deliverables ?? []) {
      await ctx.db.insert("deliverables", {
        projectId,
        title: item.title ?? "Untitled deliverable",
        description: item.description,
        target: typeof item.target === "number" ? item.target : undefined,
        achieved: 0,
        unit: item.unit,
        dueDate: item.dueDate ?? draft.endDate ?? "",
        status: "not_started",
      });
    }

    for (const ms of draft.milestones ?? []) {
      await ctx.db.insert("milestones", {
        projectId,
        title: ms.title ?? "Untitled milestone",
        dueDate: ms.dueDate ?? draft.endDate ?? "",
        status: "not_started",
      });
    }

    for (const category of draft.budgetCategories ?? []) {
      await ctx.db.insert("budgetCategories", {
        projectId,
        name: category.name ?? "General",
        approvedAmount: Number(category.amount ?? 0),
        spentAmount: 0,
      });
    }

    for (const report of draft.reportingSchedule ?? []) {
      await ctx.db.insert("reports", {
        projectId,
        periodStart: report.periodStart ?? "",
        periodEnd: report.periodEnd ?? "",
        dueDate: report.dueDate ?? "",
        status: "draft",
      });
    }

    await scheduleProjectIngestion(ctx, projectId);
    return projectId;

  },
});

export const getById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const [deliverables, budgets, activities, reports, alerts, testimonials, galleryItems] = await Promise.all([
      ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("budgetCategories").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("reports").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("alerts").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("testimonials").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("gallery").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
    ]);

    const gallery = await Promise.all(
      galleryItems.map(async (item) => ({
        ...item,
        url: await ctx.storage.getUrl(item.storageId),
      })),
    );

    return {
      ...project,
      funderLogoUrl: project.funderLogoStorageId ? await ctx.storage.getUrl(project.funderLogoStorageId) : null,
      deliverables,
      budgets,
      activities,
      reports,
      alerts: alerts.filter((alert) => !alert.resolvedAt),
      testimonials,
      gallery,
      nextReport: reports.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null,
      approvedBudget: budgets.reduce((total, row) => total + row.approvedAmount, 0),
      spentBudget: budgets.reduce((total, row) => total + row.spentAmount, 0),
      deliverablesDone: deliverables.filter((item) => item.status === "completed").length,
      deliverablesTotal: deliverables.length,
    };
  },
});

export const getContextInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const [deliverables, budgets, activities, milestones, alerts, reports] = await Promise.all([
      ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("budgetCategories").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", project._id)).order("desc").take(30),
      ctx.db.query("milestones").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("alerts").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("reports").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
    ]);
    return {
      id: project._id,
      name: project.name,
      funderName: project.funderName,
      status: project.status,
      grantAmount: project.grantAmount,
      startDate: project.startDate,
      endDate: project.endDate,
      states: project.states,
      summary: project.summary,
      deliverables: deliverables.map((d) => ({ id: d._id, title: d.title, target: d.target, achieved: d.achieved, unit: d.unit, dueDate: d.dueDate, status: d.status })),
      budgetCategories: budgets.map((b) => ({ id: b._id, name: b.name, approvedAmount: b.approvedAmount, spentAmount: b.spentAmount })),
      recentActivities: activities.map((a) => ({ id: a._id, title: a.title, activityDate: a.activityDate, state: a.state, location: a.location, teachersReached: a.teachersReached, studentsReached: a.studentsReached, schoolsReached: a.schoolsReached })),
      milestones: milestones.map((m) => ({ id: m._id, title: m.title, dueDate: m.dueDate, status: m.status })),
      unresolvedAlerts: alerts.filter((a) => !a.resolvedAt).map((a) => ({ id: a._id, title: a.title, severity: a.severity })),
      reports: reports.map((r) => ({ id: r._id, periodStart: r.periodStart, periodEnd: r.periodEnd, dueDate: r.dueDate, status: r.status, title: r.title })),
    };
  },
});

export const getOrgSummaryInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    const active = projects.filter((p) => p.status !== "completed");
    return {
      totalProjects: projects.length,
      activeProjects: active.length,
      atRisk: active.filter((p) => p.status === "at_risk" || p.status === "overdue").length,
      totalGrantAmount: active.reduce((sum, p) => sum + p.grantAmount, 0),
      projects: active.map((p) => ({
        id: p._id,
        name: p.name,
        funderName: p.funderName,
        status: p.status,
        endDate: p.endDate,
        grantAmount: p.grantAmount,
      })),
    };
  },
});

export const getReportDataInternal = internalQuery({
  args: { projectId: v.id("projects"), periodStart: v.string(), periodEnd: v.string() },
  handler: async (ctx, { projectId, periodStart, periodEnd }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const [activities, expenses, deliverables, milestones] = await Promise.all([
      ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("expenses").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("milestones").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
    ]);
    return {
      project: { name: project.name, funderName: project.funderName, grantAmount: project.grantAmount },
      periodStart,
      periodEnd,
      activities: activities.filter((a) => a.activityDate >= periodStart && a.activityDate <= periodEnd),
      expenses: expenses.filter((e) => e.spentOn >= periodStart && e.spentOn <= periodEnd),
      deliverables,
      milestones: milestones.filter((m) => m.dueDate >= periodStart && m.dueDate <= periodEnd),
    };
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    updates: v.object({
      name: v.optional(v.string()),
      funderName: v.optional(v.string()),
      grantAmount: v.optional(v.number()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      states: v.optional(v.array(v.string())),
      summary: v.optional(v.string()),
      funderLogoStorageId: v.optional(v.id("_storage")),
      status: v.optional(v.union(v.literal("on_track"), v.literal("at_risk"), v.literal("overdue"), v.literal("completed"))),
    }),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    await ctx.db.patch(args.projectId, {
      ...args.updates,
      updatedAt: Date.now(),
    });
    await scheduleProjectIngestion(ctx, args.projectId);
  },
});
