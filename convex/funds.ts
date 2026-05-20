import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCurrentPerson, requireFinanceAccess } from "./access";

// Triggering redeploy for FY-wise updates

/**
 * SEEDING & SETUP
 */

export const seedStates = mutation({
  args: {},
  handler: async (ctx) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);

    const states = [
      { name: "Karnataka", code: "KA" },
      { name: "Tamil Nadu", code: "TN" },
      { name: "Maharashtra", code: "MH" },
      { name: "Delhi", code: "DL" },
      { name: "Gujarat", code: "GJ" },
      { name: "Telangana", code: "TG" },
      { name: "Kerala", code: "KL" },
      { name: "Andhra Pradesh", code: "AP" },
      { name: "Uttar Pradesh", code: "UP" },
      { name: "West Bengal", code: "WB" },
      { name: "Rajasthan", code: "RJ" },
      { name: "Madhya Pradesh", code: "MP" },
      { name: "Haryana", code: "HR" },
      { name: "Punjab", code: "PB" },
      { name: "Bihar", code: "BR" },
      { name: "Odisha", code: "OR" },
      { name: "Pan India", code: "PAN" },
      { name: "Admin", code: "ADM" },
    ];

    for (const state of states) {
      const existing = await ctx.db
        .query("states")
        .withIndex("by_code", (q) => q.eq("code", state.code))
        .unique();
      if (!existing) {
        await ctx.db.insert("states", state);
      }
    }
  },
});

/**
 * QUERIES
 */

export const listStates = query({
  args: {},
  handler: async (ctx) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    return await ctx.db.query("states").collect();
  },
});

export const listSchools = query({
  args: { stateId: v.optional(v.id("states")) },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    const q = args.stateId
      ? ctx.db
          .query("schools")
          .withIndex("by_state", (q) => q.eq("stateId", args.stateId!))
      : ctx.db.query("schools");
    return await q.collect();
  },
});

export const listFunders = query({
  args: {},
  handler: async (ctx) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    return await ctx.db.query("funders").collect();
  },
});

export const getFinancialVisibility = query({
  args: { fiscalYear: v.string() }, // e.g. "2024-25"
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    const visibility = await ctx.db
      .query("fundVisibility")
      .withIndex("by_fiscal_year", (q) => q.eq("fiscalYear", args.fiscalYear))
      .collect();

    // Map to include funder and state names for the UI
    return await Promise.all(
      visibility.map(async (v) => {
        const funder = await ctx.db.get(v.funderId);
        const state = await ctx.db.get(v.stateId);
        return {
          ...v,
          funderName: funder?.name ?? "Unknown Funder",
          stateName: state?.name ?? "Unknown State",
        };
      }),
    );
  },
});

export const getRealVisibility = query({
  args: { fiscalYear: v.string() },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    const projects = await ctx.db.query("projects").collect();
    const [startYearStr, endYearStr] = args.fiscalYear.split("-");
    const startYear = parseInt("20" + startYearStr); 
    
    const months = [
      { name: "Apr", m: 3, y: startYear },
      { name: "May", m: 4, y: startYear },
      { name: "Jun", m: 5, y: startYear },
      { name: "Jul", m: 6, y: startYear },
      { name: "Aug", m: 7, y: startYear },
      { name: "Sep", m: 8, y: startYear },
      { name: "Oct", m: 9, y: startYear },
      { name: "Nov", m: 10, y: startYear },
      { name: "Dec", m: 11, y: startYear },
      { name: "Jan", m: 0, y: startYear + 1 },
      { name: "Feb", m: 1, y: startYear + 1 },
      { name: "Mar", m: 2, y: startYear + 1 },
    ];

    const chartData = months.map(month => {
      let confirmed = 0;
      for (const project of projects) {
        if (!project.startDate || !project.endDate || !project.grantAmount) continue;
        
        const pStart = new Date(project.startDate);
        const pEnd = new Date(project.endDate);
        if (isNaN(pStart.getTime()) || isNaN(pEnd.getTime())) continue;

        const current = new Date(month.y, month.m, 15);

        if (current >= pStart && current <= pEnd) {
          const totalDays = Math.max(1, (pEnd.getTime() - pStart.getTime()) / (24 * 60 * 60 * 1000));
          const amountPerDay = project.grantAmount / totalDays;
          confirmed += amountPerDay * 30; // Approx 30 days per month
        }
      }
      return {
        month: month.name,
        confirmed: Math.round(confirmed),
        pipeline: 0,
      };
    });

    const projectTotals = projects
      .filter(p => p.grantAmount > 0 && p.startDate && p.endDate)
      .map(p => {
        const pStart = new Date(p.startDate);
        const pEnd = new Date(p.endDate);
        const fyStart = new Date(startYear, 3, 1);
        const fyEnd = new Date(startYear + 1, 2, 31);
        
        const overlapStart = pStart > fyStart ? pStart : fyStart;
        const overlapEnd = pEnd < fyEnd ? pEnd : fyEnd;
        
        let fyAmount = 0;
        if (overlapStart < overlapEnd) {
          const totalDays = Math.max(1, (pEnd.getTime() - pStart.getTime()) / (24 * 60 * 60 * 1000));
          const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (24 * 60 * 60 * 1000);
          fyAmount = (p.grantAmount / totalDays) * overlapDays;
        }

        return {
          name: p.name,
          funder: p.funderName,
          totalGrant: p.grantAmount,
          fyVisibility: Math.round(fyAmount),
          states: p.states,
        };
      })
      .filter(p => p.fyVisibility > 0);

    return { chartData, projectTotals };
  },
});

export const getFyExpenditures = query({
  args: { fiscalYear: v.string() },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    return await ctx.db
      .query("fyExpenditure")
      .withIndex("by_fiscal_year", (q) => q.eq("fiscalYear", args.fiscalYear))
      .collect();
  },
});

export const getRealStateSpending = query({
  args: { fiscalYear: v.string() }, // e.g. "24-25"
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    const projects = await ctx.db.query("projects").collect();
    const states = await ctx.db.query("states").collect();
    
    const [startYearStr, endYearStr] = args.fiscalYear.split("-");
    const startYear = parseInt("20" + startYearStr); 
    const fyStart = new Date(startYear, 3, 1);
    const fyEnd = new Date(startYear + 1, 2, 31);

    const stateSpending: Record<string, Record<number, number>> = {};

    for (const project of projects) {
      if (!project.states || project.states.length === 0) continue;

      const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();

      const perStateShare = 1 / project.states.length;

      for (const expense of expenses) {
        const date = new Date(expense.spentOn);
        if (date < fyStart || date > fyEnd) continue;
        
        const month = date.getMonth() + 1;

        for (const stateStr of project.states) {
          const stateEntity = states.find(s => s.name === stateStr || s.code === stateStr);
          if (stateEntity) {
            const sId = stateEntity._id;
            stateSpending[sId] = stateSpending[sId] || {};
            stateSpending[sId][month] = (stateSpending[sId][month] || 0) + (expense.amount * perStateShare);
          }
        }
      }
    }

    return stateSpending;
  },
});

/**
 * MUTATIONS
 */

export const upsertFyExpenditure = mutation({
  args: {
    stateId: v.id("states"),
    fiscalYear: v.string(),
    plannedExpense: v.optional(v.number()),
    actualSpent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);

    const existing = await ctx.db
      .query("fyExpenditure")
      .withIndex("by_fiscal_year", (q) => q.eq("fiscalYear", args.fiscalYear))
      .filter((q) => q.eq(q.field("stateId"), args.stateId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        plannedExpense: args.plannedExpense ?? existing.plannedExpense,
        actualSpent: args.actualSpent ?? existing.actualSpent,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("fyExpenditure", {
        stateId: args.stateId,
        fiscalYear: args.fiscalYear,
        plannedExpense: args.plannedExpense ?? 0,
        actualSpent: args.actualSpent ?? 0,
        updatedAt: Date.now(),
      });
    }
  },
});

export const upsertVisibility = mutation({
  args: {
    funderId: v.id("funders"),
    stateId: v.id("states"),
    fiscalYear: v.string(),
    amount: v.number(),
    probability: v.number(),
    type: v.union(v.literal("confirmed"), v.literal("pipeline")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);

    const existing = await ctx.db
      .query("fundVisibility")
      .withIndex("by_fiscal_year", (q) => q.eq("fiscalYear", args.fiscalYear))
      .filter((q) => q.and(q.eq(q.field("funderId"), args.funderId), q.eq(q.field("stateId"), args.stateId)))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("fundVisibility", {
        ...args,
        updatedAt: Date.now(),
      });
    }
  },
});

export const addSchool = mutation({
  args: {
    name: v.string(),
    stateId: v.id("states"),
    funderId: v.optional(v.id("funders")),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);

    return await ctx.db.insert("schools", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const removeSchool = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    await ctx.db.delete(args.schoolId);
  },
});

export const addState = mutation({
  args: { name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    return await ctx.db.insert("states", { name: args.name, code: args.code });
  },
});

export const removeState = mutation({
  args: { stateId: v.id("states") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    
    // Cleanup linked items
    const schools = await ctx.db.query("schools").withIndex("by_state", q => q.eq("stateId", args.stateId)).collect();
    for (const s of schools) await ctx.db.delete(s._id);
    
    const visibility = await ctx.db.query("fundVisibility").withIndex("by_state", q => q.eq("stateId", args.stateId)).collect();
    for (const v_ of visibility) await ctx.db.delete(v_._id);

    await ctx.db.delete(args.stateId);
  },
});

export const removeVisibility = mutation({
  args: { visibilityId: v.id("fundVisibility") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    await ctx.db.delete(args.visibilityId);
  },
});

export const getComparativeAnalysis = query({
  args: { fiscalYear: v.string() },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    requireFinanceAccess(person);
    const expenditures = await ctx.db
      .query("fyExpenditure")
      .withIndex("by_fiscal_year", (q) => q.eq("fiscalYear", args.fiscalYear))
      .collect();

    const startYear = parseInt("20" + args.fiscalYear.split("-")[0]);
    const states = await ctx.db.query("states").collect();
    
    // Real realized funds from projects
    const realFunds = await (async () => {
      const projects = await ctx.db.query("projects").collect();
      let total = 0;
      for (const p of projects) {
        if (!p.startDate || !p.endDate || !p.grantAmount) continue;
        const pStart = new Date(p.startDate);
        const pEnd = new Date(p.endDate);
        const fyStart = new Date(startYear, 3, 1);
        const fyEnd = new Date(startYear + 1, 2, 31);
        const overlapStart = pStart > fyStart ? pStart : fyStart;
        const overlapEnd = pEnd < fyEnd ? pEnd : fyEnd;
        if (overlapStart < overlapEnd) {
          const totalDays = Math.max(1, (pEnd.getTime() - pStart.getTime()) / (24 * 60 * 60 * 1000));
          const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (24 * 60 * 60 * 1000);
          total += (p.grantAmount / totalDays) * overlapDays;
        }
      }
      return total;
    })();

    const totalPlanned = expenditures.reduce((sum, e) => sum + e.plannedExpense, 0);
    const totalActual = expenditures.reduce((sum, e) => sum + e.actualSpent, 0);

    const stateBreakdown = states.map(s => {
      const entry = expenditures.find(e => e.stateId === s._id);
      return {
        name: s.name,
        planned: entry?.plannedExpense ?? 0,
        actual: entry?.actualSpent ?? 0,
      };
    });

    return {
      totalPlanned,
      totalActual,
      realFunds,
      stateBreakdown,
    };
  },
});
