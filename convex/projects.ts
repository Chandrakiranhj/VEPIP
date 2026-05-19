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

    // ── 1. Phases first (deliverables/milestones/line items may reference them)
    const phaseIdByCode = new Map<string, Id<"projectPhases">>();
    let phaseOrder = 0;
    for (const ph of draft.phases ?? []) {
      const order = typeof ph.order === "number" ? ph.order : phaseOrder++;
      const id = await ctx.db.insert("projectPhases", {
        projectId,
        code: ph.code ?? undefined,
        name: ph.name ?? `Phase ${order + 1}`,
        description: ph.description ?? undefined,
        startDate: ph.startDate ?? undefined,
        endDate: ph.endDate ?? undefined,
        states: Array.isArray(ph.states) ? ph.states : undefined,
        status: "not_started",
        order,
        createdAt: now,
      });
      if (ph.code) phaseIdByCode.set(String(ph.code), id);
    }

    const resolvePhase = (code?: unknown): Id<"projectPhases"> | undefined => {
      if (!code) return undefined;
      return phaseIdByCode.get(String(code)) ?? undefined;
    };

    // ── 2. Deliverables
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

    // ── 3. Milestones
    for (const ms of draft.milestones ?? []) {
      await ctx.db.insert("milestones", {
        projectId,
        title: ms.title ?? "Untitled milestone",
        dueDate: ms.dueDate ?? draft.endDate ?? "",
        status: "not_started",
      });
    }

    // ── 4. Budget categories (keyed by name so line items can link)
    const categoryIdByName = new Map<string, Id<"budgetCategories">>();
    for (const category of draft.budgetCategories ?? []) {
      const name = category.name ?? "General";
      const id = await ctx.db.insert("budgetCategories", {
        projectId,
        name,
        approvedAmount: Number(category.amount ?? 0),
        spentAmount: 0,
      });
      categoryIdByName.set(name.toLowerCase().trim(), id);
    }

    // ── 5. Budget line items
    for (const li of draft.budgetLineItems ?? []) {
      const catName = String(li.categoryName ?? "").toLowerCase().trim();
      await ctx.db.insert("budgetLineItems", {
        projectId,
        categoryId: catName ? categoryIdByName.get(catName) : undefined,
        phaseId: resolvePhase(li.phaseCode),
        state: li.state ?? undefined,
        name: li.name ?? "Untitled line item",
        description: li.description ?? undefined,
        subCategory: li.subCategory ?? undefined,
        unitCost: typeof li.unitCost === "number" ? li.unitCost : undefined,
        units: typeof li.units === "number" ? li.units : undefined,
        months: typeof li.months === "number" ? li.months : undefined,
        totalCost: Number(li.totalCost ?? 0),
        partnerContribution: typeof li.partnerContribution === "number" ? li.partnerContribution : undefined,
        inKindContribution: typeof li.inKindContribution === "number" ? li.inKindContribution : undefined,
        recurring: typeof li.recurring === "boolean" ? li.recurring : undefined,
        notes: li.notes ?? undefined,
        createdAt: now,
      });
    }

    // ── 6. Payment tranches
    for (const t of draft.paymentTranches ?? []) {
      await ctx.db.insert("paymentTranches", {
        projectId,
        tranche: Number(t.tranche ?? 0),
        amount: Number(t.amount ?? 0),
        plannedDate: t.plannedDate ?? undefined,
        triggerCondition: t.triggerCondition ?? undefined,
        requiredDocs: Array.isArray(t.requiredDocs) ? t.requiredDocs.map(String) : undefined,
        status: "planned",
        notes: t.notes ?? undefined,
        createdAt: now,
      });
    }

    // ── 7. Documents observed
    for (const d of draft.documents ?? []) {
      const kind = ["proposal", "mou", "grant_agreement", "annexure", "approval", "budget", "impact_sheet", "other"].includes(d.kind)
        ? d.kind
        : "other";
      const status = ["draft", "under_review", "signed", "active", "closed"].includes(d.status)
        ? d.status
        : "draft";
      await ctx.db.insert("projectDocuments", {
        projectId,
        kind,
        name: d.name ?? "Untitled document",
        version: d.version ?? undefined,
        status,
        issueDate: d.issueDate ?? undefined,
        effectiveDate: d.effectiveDate ?? undefined,
        expiryDate: d.expiryDate ?? undefined,
        notes: d.notes ?? undefined,
        createdAt: now,
      });
    }

    // ── 8. Parties
    for (const p of draft.parties ?? []) {
      const validKinds = ["funder", "implementer", "consortium_partner", "research_partner", "content_partner", "evaluator", "outreach_partner", "govt_department", "signatory", "other"] as const;
      const kind = validKinds.includes(p.kind) ? p.kind : "other";
      await ctx.db.insert("projectParties", {
        projectId,
        kind,
        name: p.name ?? "Unknown party",
        role: p.role ?? undefined,
        contactName: p.contactName ?? undefined,
        contactEmail: p.contactEmail ?? undefined,
        notes: p.notes ?? undefined,
        createdAt: now,
      });
    }

    // ── 9. KPIs
    for (const k of draft.kpis ?? []) {
      await ctx.db.insert("kpiIndicators", {
        projectId,
        kind: k.kind === "outcome" ? "outcome" : "output",
        title: k.title ?? "Untitled indicator",
        unit: k.unit ?? undefined,
        baseline: typeof k.baseline === "number" ? k.baseline : undefined,
        target: typeof k.target === "number" ? k.target : undefined,
        achieved: 0,
        frequency: k.frequency ?? undefined,
        dataSource: k.dataSource ?? undefined,
        collectionOwner: k.collectionOwner ?? undefined,
        reportingTemplate: k.reportingTemplate ?? undefined,
        notes: k.notes ?? undefined,
        createdAt: now,
      });
    }

    // ── 10. Compliance obligations
    for (const c of draft.compliance ?? []) {
      const validKinds = ["reporting", "audit", "visibility_branding", "ip_content", "data_privacy", "procurement", "termination", "amendment", "indemnity", "governing_law", "other"] as const;
      const kind = validKinds.includes(c.kind) ? c.kind : "other";
      await ctx.db.insert("complianceObligations", {
        projectId,
        kind,
        title: c.title ?? "Untitled obligation",
        text: c.text ?? undefined,
        frequency: c.frequency ?? undefined,
        dueDate: c.dueDate ?? undefined,
        status: "active",
        notes: c.notes ?? undefined,
        createdAt: now,
      });
    }

    // ── 11. Approvals
    for (const a of draft.approvals ?? []) {
      await ctx.db.insert("projectApprovals", {
        projectId,
        state: a.state ?? undefined,
        department: a.department ?? undefined,
        title: a.title ?? "Untitled approval",
        status: "not_started",
        notes: a.notes ?? undefined,
        createdAt: now,
      });
    }

    // ── 12. Risks
    for (const r of draft.risks ?? []) {
      const severity = ["low", "medium", "high"].includes(r.severity) ? r.severity : "medium";
      const likelihood = ["low", "medium", "high"].includes(r.likelihood) ? r.likelihood : undefined;
      await ctx.db.insert("projectRisks", {
        projectId,
        title: r.title ?? "Untitled risk",
        description: r.description ?? undefined,
        severity,
        likelihood,
        mitigation: r.mitigation ?? undefined,
        status: "open",
        createdAt: now,
      });
    }

    // ── 13. Reporting schedule (existing reports table)
    for (const report of draft.reportingSchedule ?? []) {
      await ctx.db.insert("reports", {
        projectId,
        periodStart: report.periodStart ?? "",
        periodEnd: report.periodEnd ?? "",
        dueDate: report.dueDate ?? "",
        status: "draft",
      });
    }

    // ── 14. Intake gaps (what the AI couldn't resolve from the documents)
    for (const gap of draft.risksOrAmbiguities ?? []) {
      const text = typeof gap === "string" ? gap : String(gap?.text ?? "");
      if (!text.trim()) continue;
      await ctx.db.insert("intakeGaps", {
        projectId,
        severity: "warn",
        text: text.trim(),
        resolved: false,
        createdAt: now,
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
