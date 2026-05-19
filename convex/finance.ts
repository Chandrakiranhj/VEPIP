/**
 * Org-wide financial analytics + multi-year planning.
 *
 * Indian fiscal year convention: "26-27" = 1 Apr 2026 → 31 Mar 2027.
 *
 * Coverage math: for each project active during a FY, attribute its grant
 * across the FY pro-rata by overlap days, then split across states by
 * `project.stateAllocations` (when set) or equal split across `project.states`.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireCurrentPerson, requireLeadership } from "./access";

// ── Fiscal year helpers ─────────────────────────────────────────────────────

function fyStartDate(fy: string): Date {
  // "26-27" → Apr 1 2026
  const startStr = fy.split("-")[0];
  const startYear = parseInt(startStr.length === 2 ? `20${startStr}` : startStr, 10);
  return new Date(Date.UTC(startYear, 3, 1));   // month 3 = April
}

function fyEndDate(fy: string): Date {
  const startStr = fy.split("-")[0];
  const startYear = parseInt(startStr.length === 2 ? `20${startStr}` : startStr, 10);
  // last instant of 31 March of the following year
  return new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999));
}

function dayOverlap(a1: Date, a2: Date, b1: Date, b2: Date): number {
  const start = Math.max(a1.getTime(), b1.getTime());
  const end = Math.min(a2.getTime(), b2.getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

interface StateAllocation {
  state: string;
  fraction: number;
}

function normalisedAllocations(project: Doc<"projects">): StateAllocation[] {
  if (project.stateAllocations && project.stateAllocations.length > 0) {
    const total = project.stateAllocations.reduce((s, a) => s + (a.fraction || 0), 0);
    if (total > 0) {
      return project.stateAllocations.map((a) => ({
        state: a.state,
        fraction: a.fraction / total,
      }));
    }
  }
  if (project.states && project.states.length > 0) {
    const fraction = 1 / project.states.length;
    return project.states.map((state) => ({ state, fraction }));
  }
  return [];
}

interface ProjectFyContribution {
  projectId: Id<"projects">;
  projectName: string;
  funderName: string;
  status: Doc<"projects">["status"];
  fyAmount: number;
  byState: Map<string, number>;
}

function projectFyContribution(
  project: Doc<"projects">,
  fyStart: Date,
  fyEnd: Date,
): ProjectFyContribution | null {
  const pStart = project.startDate ? new Date(project.startDate) : null;
  const pEnd = project.endDate ? new Date(project.endDate) : null;
  if (!pStart || !pEnd || Number.isNaN(pStart.getTime()) || Number.isNaN(pEnd.getTime())) {
    return null;
  }
  const totalDays = dayOverlap(pStart, pEnd, pStart, pEnd);
  if (totalDays <= 0 || !project.grantAmount) return null;
  const overlapDays = dayOverlap(pStart, pEnd, fyStart, fyEnd);
  if (overlapDays <= 0) return null;
  const fyAmount = (project.grantAmount / totalDays) * overlapDays;
  const allocs = normalisedAllocations(project);
  const byState = new Map<string, number>();
  for (const a of allocs) {
    byState.set(a.state, (byState.get(a.state) ?? 0) + fyAmount * a.fraction);
  }
  return {
    projectId: project._id,
    projectName: project.name,
    funderName: project.funderName,
    status: project.status,
    fyAmount,
    byState,
  };
}

// ── Org-wide financial overview ──────────────────────────────────────────────

export const getOrgFinancialOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentPerson(ctx);
    const projects = await ctx.db.query("projects").collect();
    const allBudgets = await ctx.db.query("budgetCategories").collect();
    const allExpenses = await ctx.db.query("expenses").collect();

    const budgetsByProject = new Map<string, Doc<"budgetCategories">[]>();
    for (const b of allBudgets) {
      const arr = budgetsByProject.get(b.projectId) ?? [];
      arr.push(b);
      budgetsByProject.set(b.projectId, arr);
    }

    let totalCommitted = 0;
    let totalApproved = 0;
    let totalSpent = 0;
    const statusCounts: Record<string, number> = {
      on_track: 0,
      at_risk: 0,
      overdue: 0,
      completed: 0,
    };
    const funderTotals = new Map<string, number>();

    for (const p of projects) {
      totalCommitted += p.grantAmount ?? 0;
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
      funderTotals.set(p.funderName, (funderTotals.get(p.funderName) ?? 0) + (p.grantAmount ?? 0));
      const budgets = budgetsByProject.get(p._id) ?? [];
      totalApproved += budgets.reduce((s, b) => s + (b.approvedAmount ?? 0), 0);
      totalSpent += budgets.reduce((s, b) => s + (b.spentAmount ?? 0), 0);
    }

    const topFunders = Array.from(funderTotals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const utilisation = totalApproved > 0 ? totalSpent / totalApproved : 0;

    return {
      totalProjects: projects.length,
      totalCommittedGrants: totalCommitted,
      totalApprovedBudget: totalApproved,
      totalSpent,
      utilisation,
      statusCounts,
      topFunders,
      expenseCount: allExpenses.length,
    };
  },
});

// ── Statewise coverage for one FY ────────────────────────────────────────────

export const getStatewiseCoverage = query({
  args: { fiscalYear: v.string() },
  handler: async (ctx, { fiscalYear }) => {
    await requireCurrentPerson(ctx);
    const fyStart = fyStartDate(fiscalYear);
    const fyEnd = fyEndDate(fiscalYear);

    const [projects, states, targets] = await Promise.all([
      ctx.db.query("projects").collect(),
      ctx.db.query("states").collect(),
      ctx.db
        .query("stateAnnualTargets")
        .withIndex("by_fiscal_year", (q) => q.eq("fiscalYear", fiscalYear))
        .collect(),
    ]);

    // Per-state target lookup
    const targetByState = new Map<string, number>();
    for (const t of targets) {
      targetByState.set(t.stateId, t.targetAmount);
    }

    // Per-state coverage + contributing projects
    interface StateAgg {
      stateId: Id<"states">;
      stateName: string;
      stateCode: string;
      target: number;
      covered: number;
      projects: Array<{
        projectId: Id<"projects">;
        name: string;
        funderName: string;
        amount: number;
      }>;
    }
    const byStateAgg = new Map<string, StateAgg>();

    // Index states by both name and code for matching project.states strings.
    const stateLookup = new Map<string, Doc<"states">>();
    for (const s of states) {
      stateLookup.set(s.name.toLowerCase(), s);
      stateLookup.set(s.code.toLowerCase(), s);
    }

    for (const project of projects) {
      const contrib = projectFyContribution(project, fyStart, fyEnd);
      if (!contrib) continue;
      for (const [stateStr, amount] of contrib.byState) {
        const stateRow = stateLookup.get(stateStr.toLowerCase());
        if (!stateRow) continue;
        const key = String(stateRow._id);
        let agg = byStateAgg.get(key);
        if (!agg) {
          agg = {
            stateId: stateRow._id,
            stateName: stateRow.name,
            stateCode: stateRow.code,
            target: targetByState.get(key) ?? 0,
            covered: 0,
            projects: [],
          };
          byStateAgg.set(key, agg);
        }
        agg.covered += amount;
        agg.projects.push({
          projectId: project._id,
          name: project.name,
          funderName: project.funderName,
          amount,
        });
      }
    }

    // Also include states that have targets but no projects yet (zero coverage).
    for (const t of targets) {
      const key = String(t.stateId);
      if (byStateAgg.has(key)) continue;
      const stateRow = states.find((s) => s._id === t.stateId);
      if (!stateRow) continue;
      byStateAgg.set(key, {
        stateId: stateRow._id,
        stateName: stateRow.name,
        stateCode: stateRow.code,
        target: t.targetAmount,
        covered: 0,
        projects: [],
      });
    }

    const rows = Array.from(byStateAgg.values()).map((row) => {
      const gap = Math.max(0, row.target - row.covered);
      const coveragePct = row.target > 0 ? Math.min(100, (row.covered / row.target) * 100) : null;
      return {
        ...row,
        projects: row.projects.sort((a, b) => b.amount - a.amount),
        gap,
        coveragePct,
      };
    });
    rows.sort((a, b) => b.target - a.target || b.covered - a.covered);

    const totals = {
      target: rows.reduce((s, r) => s + r.target, 0),
      covered: rows.reduce((s, r) => s + r.covered, 0),
      gap: rows.reduce((s, r) => s + r.gap, 0),
      projectCount: new Set(rows.flatMap((r) => r.projects.map((p) => p.projectId))).size,
    };

    return { rows, totals };
  },
});

// ── Multi-year target × coverage matrix ─────────────────────────────────────

export const getMultiYearTargetMatrix = query({
  args: { fromFy: v.string(), toFy: v.string() },
  handler: async (ctx, { fromFy, toFy }) => {
    await requireCurrentPerson(ctx);
    const fromStart = parseInt(fromFy.split("-")[0], 10);
    const toStart = parseInt(toFy.split("-")[0], 10);
    if (Number.isNaN(fromStart) || Number.isNaN(toStart) || toStart < fromStart) {
      return { fiscalYears: [], states: [], targets: [], coverage: [] };
    }
    const fiscalYears: string[] = [];
    for (let y = fromStart; y <= toStart; y++) {
      const next = (y + 1).toString().padStart(2, "0").slice(-2);
      const cur = y.toString().padStart(2, "0").slice(-2);
      fiscalYears.push(`${cur}-${next}`);
    }

    const [states, projects, allTargets] = await Promise.all([
      ctx.db.query("states").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("stateAnnualTargets").collect(),
    ]);

    // Target lookup: stateId × FY → amount
    const targetMap = new Map<string, Map<string, number>>();
    for (const t of allTargets) {
      const k = String(t.stateId);
      if (!targetMap.has(k)) targetMap.set(k, new Map());
      targetMap.get(k)!.set(t.fiscalYear, t.targetAmount);
    }

    // Coverage: per state × FY
    const stateLookup = new Map<string, Doc<"states">>();
    for (const s of states) {
      stateLookup.set(s.name.toLowerCase(), s);
      stateLookup.set(s.code.toLowerCase(), s);
    }
    const coverageMap = new Map<string, Map<string, number>>();
    for (const fy of fiscalYears) {
      const fyStart = fyStartDate(fy);
      const fyEnd = fyEndDate(fy);
      for (const project of projects) {
        const contrib = projectFyContribution(project, fyStart, fyEnd);
        if (!contrib) continue;
        for (const [stateStr, amount] of contrib.byState) {
          const row = stateLookup.get(stateStr.toLowerCase());
          if (!row) continue;
          const k = String(row._id);
          if (!coverageMap.has(k)) coverageMap.set(k, new Map());
          const m = coverageMap.get(k)!;
          m.set(fy, (m.get(fy) ?? 0) + amount);
        }
      }
    }

    const targets = states.map((s) => ({
      stateId: s._id,
      stateName: s.name,
      stateCode: s.code,
      cells: fiscalYears.map((fy) => ({
        fy,
        target: targetMap.get(String(s._id))?.get(fy) ?? 0,
        covered: coverageMap.get(String(s._id))?.get(fy) ?? 0,
      })),
    }));

    const totalsByFy = fiscalYears.map((fy) => ({
      fy,
      target: targets.reduce((sum, row) => sum + (row.cells.find((c) => c.fy === fy)?.target ?? 0), 0),
      covered: targets.reduce((sum, row) => sum + (row.cells.find((c) => c.fy === fy)?.covered ?? 0), 0),
    }));

    return { fiscalYears, states, targets, totalsByFy };
  },
});

// ── Mutations ───────────────────────────────────────────────────────────────

export const setStateAnnualTarget = mutation({
  args: {
    stateId: v.id("states"),
    fiscalYear: v.string(),
    targetAmount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireLeadership(person);

    const existing = await ctx.db
      .query("stateAnnualTargets")
      .withIndex("by_state_year", (q) =>
        q.eq("stateId", args.stateId).eq("fiscalYear", args.fiscalYear),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        targetAmount: args.targetAmount,
        notes: args.notes ?? existing.notes,
        createdBy: person._id,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return ctx.db.insert("stateAnnualTargets", {
      stateId: args.stateId,
      fiscalYear: args.fiscalYear,
      targetAmount: args.targetAmount,
      notes: args.notes,
      createdBy: person._id,
      updatedAt: Date.now(),
    });
  },
});

export const removeStateAnnualTarget = mutation({
  args: { targetId: v.id("stateAnnualTargets") },
  handler: async (ctx, { targetId }) => {
    const { person } = await requireCurrentPerson(ctx);
    requireLeadership(person);
    await ctx.db.delete(targetId);
  },
});

export const setProjectStateAllocations = mutation({
  args: {
    projectId: v.id("projects"),
    allocations: v.array(
      v.object({ state: v.string(), fraction: v.number() }),
    ),
  },
  handler: async (ctx, { projectId, allocations }) => {
    const { person } = await requireCurrentPerson(ctx);
    requireLeadership(person);

    // Normalise: drop zeros, ensure they sum to ~1 (warn if not).
    const cleaned = allocations.filter((a) => a.fraction > 0);
    const total = cleaned.reduce((s, a) => s + a.fraction, 0);
    const normalised = total > 0
      ? cleaned.map((a) => ({ state: a.state, fraction: a.fraction / total }))
      : [];
    await ctx.db.patch(projectId, {
      stateAllocations: normalised,
      updatedAt: Date.now(),
    });
  },
});
