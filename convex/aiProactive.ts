import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireCurrentPerson, requireProjectAccess, canSeeAllProjects } from "./access";

// ── Suggestion kind / status enums (mirrors schema) ──────────────────────────

const SUGGESTION_KIND = v.union(
  v.literal("report_draft"),
  v.literal("activity_prefill"),
  v.literal("expense_prefill"),
  v.literal("alert"),
  v.literal("digest"),
);

const SUGGESTION_STATUS = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("dismissed"),
  v.literal("edited"),
);

const SUGGESTION_SOURCE = v.union(
  v.literal("scheduled"),
  v.literal("threshold"),
  v.literal("upload"),
);

// ── Internal: write a suggestion, deduping on (kind, projectId, sourceRef) ───

export const writeSuggestion = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    kind: SUGGESTION_KIND,
    title: v.string(),
    summary: v.string(),
    payload: v.any(),
    source: SUGGESTION_SOURCE,
    sourceRef: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"aiSuggestions">> => {
    // Collapse: if an identical pending suggestion exists, update it.
    if (args.sourceRef) {
      const all = await ctx.db
        .query("aiSuggestions")
        .withIndex("by_kind", (q) => q.eq("kind", args.kind))
        .collect();
      const dup = all.find(
        (s) =>
          s.status === "pending" &&
          s.projectId === args.projectId &&
          s.sourceRef === args.sourceRef,
      );
      if (dup) {
        await ctx.db.patch(dup._id, {
          title: args.title,
          summary: args.summary,
          payload: args.payload,
        });
        return dup._id;
      }
    }
    return ctx.db.insert("aiSuggestions", {
      projectId: args.projectId,
      kind: args.kind,
      title: args.title,
      summary: args.summary,
      payload: args.payload,
      status: "pending",
      createdAt: Date.now(),
      source: args.source,
      sourceRef: args.sourceRef,
    });
  },
});

// ── Threshold scanner (hourly) ───────────────────────────────────────────────

export const scanThresholds = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scanned: number; suggestionsWritten: number }> => {
    return ctx.runMutation(internal.aiProactive.scanThresholdsSync, {});
  },
});

export const scanThresholdsSync = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let alertsWritten = 0;

    const projects = await ctx.db.query("projects").collect();
    const activeProjects = projects.filter((p) => p.status !== "completed");

    for (const proj of activeProjects) {
      // (1) Budget utilisation > 90 %
      const budgets = await ctx.db
        .query("budgetCategories")
        .withIndex("by_project", (q) => q.eq("projectId", proj._id))
        .collect();
      const approved = budgets.reduce((s, b) => s + (b.approvedAmount ?? 0), 0);
      const spent = budgets.reduce((s, b) => s + (b.spentAmount ?? 0), 0);
      if (approved > 0 && spent / approved >= 0.9) {
        await ctx.runMutation(internal.aiProactive.writeSuggestion, {
          projectId: proj._id,
          kind: "alert",
          title: `Budget at ${Math.round((spent / approved) * 100)}% utilisation`,
          summary: `Approved ₹${approved.toLocaleString()} · Spent ₹${spent.toLocaleString()}. Consider reviewing spend or re-allocating before overrun.`,
          payload: {
            severity: "watch",
            metric: "budget_utilisation",
            spent,
            approved,
          },
          source: "threshold",
          sourceRef: `${proj._id}:budget`,
        });
        alertsWritten++;
      }

      // (2) Activity silence > 21 days
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_project", (q) => q.eq("projectId", proj._id))
        .collect();
      const latestActivity = activities
        .map((a) => Date.parse(a.activityDate))
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => b - a)[0];
      const silenceDays = latestActivity
        ? Math.floor((now - latestActivity) / (24 * 60 * 60 * 1000))
        : Number.POSITIVE_INFINITY;
      if (activities.length > 0 && silenceDays > 21) {
        await ctx.runMutation(internal.aiProactive.writeSuggestion, {
          projectId: proj._id,
          kind: "alert",
          title: `No field activity logged for ${silenceDays} days`,
          summary: "Project shows no recent activities. Check with the PM whether reporting has fallen behind, or whether work has paused.",
          payload: { severity: "watch", metric: "activity_silence", silenceDays },
          source: "threshold",
          sourceRef: `${proj._id}:silence`,
        });
        alertsWritten++;
      }

      // (3) Deliverable flat-line: target > 0, achieved unchanged for 30 days.
      // We can't detect "unchanged" without history, so approximate: any
      // deliverable that hasn't hit its target and whose due date is < 30 days
      // away gets flagged.
      const deliverables = await ctx.db
        .query("deliverables")
        .withIndex("by_project", (q) => q.eq("projectId", proj._id))
        .collect();
      for (const d of deliverables) {
        const target = d.target ?? 0;
        const achieved = d.achieved ?? 0;
        if (target <= 0) continue;
        if (achieved >= target) continue;
        const dueMs = Date.parse(d.dueDate);
        if (Number.isNaN(dueMs)) continue;
        const daysToDue = Math.floor((dueMs - now) / (24 * 60 * 60 * 1000));
        if (daysToDue > 30 || daysToDue < -30) continue;
        const pct = Math.round((achieved / target) * 100);
        if (pct >= 90) continue;
        await ctx.runMutation(internal.aiProactive.writeSuggestion, {
          projectId: proj._id,
          kind: "alert",
          title: `Deliverable "${d.title}" at ${pct}% with ${daysToDue} days to due`,
          summary: `Target ${target} ${d.unit ?? ""}, achieved ${achieved}. Plan the remaining work or flag to the funder if a shift is needed.`,
          payload: {
            severity: daysToDue < 0 ? "critical" : "watch",
            metric: "deliverable_at_risk",
            deliverableId: d._id,
            pct,
            daysToDue,
          },
          source: "threshold",
          sourceRef: `${d._id}:at_risk`,
        });
        alertsWritten++;
      }
    }

    return { scanned: activeProjects.length, suggestionsWritten: alertsWritten };
  },
});

// ── Scheduled scanner (daily) ────────────────────────────────────────────────

export const scanSchedules = internalAction({
  args: {},
  handler: async (ctx): Promise<{ suggestionsWritten: number }> => {
    return ctx.runMutation(internal.aiProactive.scanSchedulesSync, {});
  },
});

export const scanSchedulesSync = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let suggestions = 0;

    // (1) Deliverable due-date approach (7 days).
    const allDeliverables = await ctx.db.query("deliverables").collect();
    for (const d of allDeliverables) {
      if (d.status === "completed") continue;
      const dueMs = Date.parse(d.dueDate);
      if (Number.isNaN(dueMs)) continue;
      const daysToDue = Math.floor((dueMs - now) / (24 * 60 * 60 * 1000));
      if (daysToDue !== 7 && daysToDue !== 1) continue;
      const proj = await ctx.db.get(d.projectId);
      if (!proj) continue;
      await ctx.runMutation(internal.aiProactive.writeSuggestion, {
        projectId: proj._id,
        kind: "alert",
        title: `Deliverable "${d.title}" due in ${daysToDue} day${daysToDue > 1 ? "s" : ""}`,
        summary: `Target ${d.target ?? "—"} ${d.unit ?? ""}, achieved ${d.achieved ?? 0}. Make sure progress is logged ahead of the funder check-in.`,
        payload: {
          severity: daysToDue === 1 ? "critical" : "watch",
          metric: "deliverable_due_soon",
          deliverableId: d._id,
          daysToDue,
        },
        source: "scheduled",
        sourceRef: `${d._id}:due_soon`,
      });
      suggestions++;
    }

    // (2) Report period close — when periodEnd is today, suggest a draft.
    const today = new Date(now).toISOString().slice(0, 10);
    const reports = await ctx.db.query("reports").collect();
    for (const r of reports) {
      if (r.periodEnd !== today) continue;
      if (r.status !== "draft") continue;
      const proj = await ctx.db.get(r.projectId);
      if (!proj) continue;
      await ctx.runMutation(internal.aiProactive.writeSuggestion, {
        projectId: proj._id,
        kind: "report_draft",
        title: `Report period closed for ${proj.name}`,
        summary: `Period ${r.periodStart} → ${r.periodEnd} ended today. The agent can draft this report from live data.`,
        payload: {
          reportId: r._id,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          reportType: r.reportType ?? "quarterly",
        },
        source: "scheduled",
        sourceRef: `${r._id}:period_close`,
      });
      suggestions++;
    }

    // (3) Funder reporting cadence — quarterly cadence rough check: if a
    // funder.reportingCadence text contains "quarterly" and today is the 1st
    // of Jan/Apr/Jul/Oct, suggest drafting a quarterly for every project.
    const d = new Date(now);
    if (d.getUTCDate() === 1 && [0, 3, 6, 9].includes(d.getUTCMonth())) {
      const projects = await ctx.db.query("projects").collect();
      for (const proj of projects.filter((p) => p.status !== "completed")) {
        if (!proj.funderId) continue;
        const funder = await ctx.db.get(proj.funderId);
        if (!funder?.reportingCadence) continue;
        if (!funder.reportingCadence.toLowerCase().includes("quarter")) continue;
        await ctx.runMutation(internal.aiProactive.writeSuggestion, {
          projectId: proj._id,
          kind: "report_draft",
          title: `Quarterly cadence: time to draft a report for ${funder.name}`,
          summary: `${funder.name}'s reporting cadence is ${funder.reportingCadence}. A quarterly draft for the previous 3 months is suggested.`,
          payload: {
            funderName: funder.name,
            cadence: funder.reportingCadence,
            suggestedReportType: "quarterly",
          },
          source: "scheduled",
          sourceRef: `${proj._id}:${d.toISOString().slice(0, 7)}:cadence`,
        });
        suggestions++;
      }
    }

    return { suggestionsWritten: suggestions };
  },
});

// ── UI-facing queries / mutations (per-user RBAC) ───────────────────────────

export const listForUser = query({
  args: { status: v.optional(SUGGESTION_STATUS) },
  handler: async (ctx, { status }) => {
    const { person } = await requireCurrentPerson(ctx);
    const seeAll = canSeeAllProjects(person);
    const all = status
      ? await ctx.db.query("aiSuggestions").withIndex("by_status", (q) => q.eq("status", status)).collect()
      : await ctx.db.query("aiSuggestions").collect();

    let accessible: typeof all;
    if (seeAll) {
      accessible = all;
    } else {
      const projects = await ctx.db.query("projects").collect();
      const memberships = await ctx.db
        .query("projectMembers")
        .withIndex("by_person", (q) => q.eq("personId", person._id))
        .collect();
      const memberSet = new Set(memberships.map((m) => m.projectId));
      const visibleProjectIds = new Set(
        projects
          .filter(
            (p) =>
              p.programManagerId === person._id ||
              p.accountManagerId === person._id ||
              memberSet.has(p._id),
          )
          .map((p) => p._id),
      );
      accessible = all.filter((s) =>
        s.projectId ? visibleProjectIds.has(s.projectId) : false,
      );
    }

    // Hydrate with project names for the UI.
    const projectCache = new Map<string, string>();
    const hydrated = await Promise.all(
      accessible
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (s) => {
          let projectName: string | null = null;
          if (s.projectId) {
            if (projectCache.has(s.projectId)) {
              projectName = projectCache.get(s.projectId)!;
            } else {
              const p = await ctx.db.get(s.projectId);
              projectName = p?.name ?? null;
              if (projectName) projectCache.set(s.projectId, projectName);
            }
          }
          return { ...s, projectName };
        }),
    );
    return hydrated;
  },
});

export const countPendingForUser = query({
  args: {},
  handler: async (ctx) => {
    const { person } = await requireCurrentPerson(ctx);
    const seeAll = canSeeAllProjects(person);
    const pending = await ctx.db
      .query("aiSuggestions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    if (seeAll) return pending.length;
    const projects = await ctx.db.query("projects").collect();
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_person", (q) => q.eq("personId", person._id))
      .collect();
    const memberSet = new Set(memberships.map((m) => m.projectId));
    const visible = new Set(
      projects
        .filter(
          (p) =>
            p.programManagerId === person._id ||
            p.accountManagerId === person._id ||
            memberSet.has(p._id),
        )
        .map((p) => p._id),
    );
    return pending.filter((s) => s.projectId && visible.has(s.projectId)).length;
  },
});

async function ensureCanReview(
  ctx: MutationCtx,
  suggestionId: Id<"aiSuggestions">,
) {
  const { person } = await requireCurrentPerson(ctx);
  const s = await ctx.db.get(suggestionId);
  if (!s) throw new Error("Suggestion not found");
  if (s.projectId) {
    await requireProjectAccess(ctx, person, s.projectId);
  } else if (!canSeeAllProjects(person)) {
    throw new Error("Only leadership can review org-level suggestions");
  }
  return { person, suggestion: s };
}

export const dismissSuggestion = mutation({
  args: { suggestionId: v.id("aiSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const { person } = await ensureCanReview(ctx, suggestionId);
    await ctx.db.patch(suggestionId, {
      status: "dismissed",
      reviewedBy: person._id,
      reviewedAt: Date.now(),
    });
  },
});

export const acceptSuggestion = mutation({
  args: { suggestionId: v.id("aiSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const { person, suggestion } = await ensureCanReview(ctx, suggestionId);
    // For most kinds the "accept" just acknowledges the alert — the real
    // write (report draft, activity record) is the user's next action,
    // either via dedicated buttons in the UI or by re-using the existing
    // forms. We mark the suggestion accepted so it leaves the inbox.
    await ctx.db.patch(suggestionId, {
      status: "accepted",
      reviewedBy: person._id,
      reviewedAt: Date.now(),
    });
    // If the suggestion is an alert with a known severity, mirror it into
    // the canonical `alerts` table so the existing UI surfaces it.
    if (suggestion.kind === "alert" && suggestion.projectId) {
      const sev = (suggestion.payload as { severity?: string } | undefined)?.severity;
      const severity: "info" | "watch" | "critical" =
        sev === "critical" ? "critical" : sev === "watch" ? "watch" : "info";
      await ctx.db.insert("alerts", {
        projectId: suggestion.projectId,
        title: suggestion.title,
        severity,
        createdAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const markEdited = mutation({
  args: { suggestionId: v.id("aiSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const { person } = await ensureCanReview(ctx, suggestionId);
    await ctx.db.patch(suggestionId, {
      status: "edited",
      reviewedBy: person._id,
      reviewedAt: Date.now(),
    });
  },
});
