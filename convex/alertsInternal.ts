import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canSeeAllProjects, requireCurrentPerson, requireProjectAccess } from "./access";

// ─── Public: manual alert creation ───────────────────────────────────────────

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    severity: v.union(v.literal("info"), v.literal("watch"), v.literal("critical")),
    dueDate: v.optional(v.string()),
    ownerId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    return ctx.db.insert("alerts", { ...args, createdAt: Date.now() });
  },
});

export const listUnresolved = query({
  args: {},
  handler: async (ctx) => {
    const { person } = await requireCurrentPerson(ctx);
    const alerts = await ctx.db.query("alerts").collect();
    if (canSeeAllProjects(person)) {
      return alerts.filter((a) => !a.resolvedAt);
    }

    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_person", (q) => q.eq("personId", person._id))
      .collect();
    const memberProjectIds = new Set(memberships.map((membership) => membership.projectId));
    const projects = await ctx.db.query("projects").collect();
    const accessibleProjectIds = new Set(
      projects
        .filter(
          (project) =>
            project.programManagerId === person._id ||
            project.accountManagerId === person._id ||
            memberProjectIds.has(project._id),
        )
        .map((project) => project._id),
    );

    return alerts.filter((a) => !a.resolvedAt && accessibleProjectIds.has(a.projectId));
  },
});

// ─── Internal: daily health check ─────────────────────────────────────────────

async function alertExists(
  ctx: any,
  projectId: Id<"projects">,
  titleFragment: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query("alerts")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  return existing.some(
    (a: any) => !a.resolvedAt && a.title.includes(titleFragment),
  );
}

export const writeAlertInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    severity: v.union(v.literal("info"), v.literal("watch"), v.literal("critical")),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("alerts", { ...args, createdAt: Date.now() });
  },
});

export const runDailyChecks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const projects = await ctx.db.query("projects").collect();

    for (const project of projects) {
      if (project.status === "completed") continue;

      const [deliverables, milestones, budgets, activities, reports] =
        await Promise.all([
          ctx.db
            .query("deliverables")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect(),
          ctx.db
            .query("milestones")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect(),
          ctx.db
            .query("budgetCategories")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect(),
          ctx.db
            .query("activities")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect(),
          ctx.db
            .query("reports")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect(),
        ]);

      let hasCritical = false;
      let hasWatch = false;

      // ── 1. Overdue deliverables ─────────────────────────────────────────────
      for (const d of deliverables) {
        if (d.status !== "completed" && d.dueDate < today) {
          await ctx.db.patch(d._id, { status: "overdue" });
          const fragment = `Deliverable overdue: ${d.title.slice(0, 40)}`;
          if (!(await alertExists(ctx, project._id, fragment))) {
            await ctx.db.insert("alerts", {
              projectId: project._id,
              title: `Deliverable overdue: ${d.title}`,
              severity: "critical",
              dueDate: d.dueDate,
              createdAt: Date.now(),
            });
          }
          hasCritical = true;
        }
      }

      // ── 2. Overdue milestones ───────────────────────────────────────────────
      for (const m of milestones) {
        if (m.status !== "completed" && m.dueDate < today) {
          await ctx.db.patch(m._id, { status: "overdue" });
          const fragment = `Milestone overdue: ${m.title.slice(0, 40)}`;
          if (!(await alertExists(ctx, project._id, fragment))) {
            await ctx.db.insert("alerts", {
              projectId: project._id,
              title: `Milestone overdue: ${m.title}`,
              severity: "watch",
              dueDate: m.dueDate,
              createdAt: Date.now(),
            });
          }
          hasWatch = true;
        }
      }

      // ── 3. Budget threshold (>90% spent) ───────────────────────────────────
      for (const b of budgets) {
        if (b.approvedAmount > 0) {
          const pct = (b.spentAmount / b.approvedAmount) * 100;
          if (pct >= 100) {
            const fragment = `Budget exhausted: ${b.name.slice(0, 30)}`;
            if (!(await alertExists(ctx, project._id, fragment))) {
              await ctx.db.insert("alerts", {
                projectId: project._id,
                title: `Budget exhausted: ${b.name} (100% spent)`,
                severity: "critical",
                createdAt: Date.now(),
              });
            }
            hasCritical = true;
          } else if (pct >= 90) {
            const fragment = `Budget >90%: ${b.name.slice(0, 30)}`;
            if (!(await alertExists(ctx, project._id, fragment))) {
              await ctx.db.insert("alerts", {
                projectId: project._id,
                title: `Budget >90% spent: ${b.name} (${Math.round(pct)}% used)`,
                severity: "watch",
                createdAt: Date.now(),
              });
            }
            hasWatch = true;
          }
        }
      }

      // ── 4. Activity inactivity (45+ days) ──────────────────────────────────
      if (activities.length === 0) {
        const projectStart = project.startDate;
        const daysSinceStart = Math.floor(
          (Date.now() - new Date(projectStart).getTime()) / 86400000,
        );
        if (daysSinceStart > 45) {
          const fragment = "No activities logged";
          if (!(await alertExists(ctx, project._id, fragment))) {
            await ctx.db.insert("alerts", {
              projectId: project._id,
              title: `No activities logged — project has been running ${daysSinceStart} days without any field activity`,
              severity: "watch",
              createdAt: Date.now(),
            });
          }
          hasWatch = true;
        }
      } else {
        const lastDate = activities
          .map((a) => a.activityDate)
          .sort()
          .at(-1)!;
        const daysSince = Math.floor(
          (Date.now() - new Date(lastDate).getTime()) / 86400000,
        );
        if (daysSince > 45) {
          const fragment = "45 days without activity";
          if (!(await alertExists(ctx, project._id, fragment))) {
            await ctx.db.insert("alerts", {
              projectId: project._id,
              title: `45 days without activity — last logged on ${lastDate}`,
              severity: "watch",
              createdAt: Date.now(),
            });
          }
          hasWatch = true;
        }
      }

      // ── 5. Reports due within 7 days ───────────────────────────────────────
      const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      for (const r of reports) {
        if (r.status === "draft" && r.dueDate >= today && r.dueDate <= soon) {
          const fragment = `Report due soon: ${r.dueDate}`;
          if (!(await alertExists(ctx, project._id, fragment))) {
            await ctx.db.insert("alerts", {
              projectId: project._id,
              title: `Report due soon: ${r.title ?? r.dueDate} — due ${r.dueDate}`,
              severity: "critical",
              dueDate: r.dueDate,
              createdAt: Date.now(),
            });
          }
          hasCritical = true;
        }
      }

      // ── 6. Auto-update project status ──────────────────────────────────────
      const allDone =
        deliverables.length > 0 &&
        deliverables.every((d) => d.status === "completed");
      const newStatus = hasCritical
        ? "overdue"
        : hasWatch
          ? "at_risk"
          : allDone
            ? "completed"
            : "on_track";

      if (project.status !== newStatus) {
        await ctx.db.patch(project._id, {
          status: newStatus,
          updatedAt: Date.now(),
        });
      }
    }
  },
});
