import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, query } from "./_generated/server";
import { requireCurrentPerson, requireProjectAccess } from "./access";

function fiscalYearForDate(dateInput?: string | null) {
  if (!dateInput) return undefined;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startYear = month >= 3 ? year : year - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(startYear % 100)}-${pad((startYear + 1) % 100)}`;
}

function countsTowardBudget(status: Doc<"expenses">["status"]) {
  return status === "submitted" || status === "approved";
}

function activityText(a: Pick<Doc<"activities">, "title" | "notes" | "testimonial" | "testimonialBy" | "state" | "location">) {
  return [
    a.title,
    a.notes ?? "",
    a.testimonial
      ? `Quote: ${a.testimonial}${a.testimonialBy ? ` — ${a.testimonialBy}` : ""}`
      : "",
    a.state ? `State: ${a.state}` : "",
    a.location ? `Location: ${a.location}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function scheduleActivityIngestion(ctx: MutationCtx, activityId: Id<"activities">) {
  const a = await ctx.db.get(activityId);
  if (!a) return;
  const text = activityText(a);
  if (!text.trim()) return;
  await ctx.scheduler.runAfter(0, internal.aiIngest.upsertAndSchedule, {
    projectId: a.projectId,
    kind: "activity_note",
    sourceTable: "activities",
    sourceId: activityId,
    title: `${a.activityDate} — ${a.title}`,
    text,
  });
}

async function scheduleReportIngestion(ctx: MutationCtx, reportId: Id<"reports">) {
  const r = await ctx.db.get(reportId);
  if (!r?.draft) return;
  await ctx.scheduler.runAfter(0, internal.aiIngest.upsertAndSchedule, {
    projectId: r.projectId,
    kind: "report_draft",
    sourceTable: "reports",
    sourceId: reportId,
    title: r.title ?? `Report ${r.periodStart} → ${r.periodEnd}`,
    text: r.draft,
  });
}

export const logActivity = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    activityDate: v.string(),
    state: v.optional(v.string()),
    location: v.optional(v.string()),
    teachersReached: v.optional(v.number()),
    studentsReached: v.optional(v.number()),
    schoolsReached: v.optional(v.number()),
    notes: v.optional(v.string()),
    testimonial: v.optional(v.string()),
    testimonialBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const id = await ctx.db.insert("activities", args);
    await scheduleActivityIngestion(ctx, id);
    return id;
  },
});

export const updateActivity = mutation({
  args: {
    activityId: v.id("activities"),
    title: v.optional(v.string()),
    activityDate: v.optional(v.string()),
    state: v.optional(v.string()),
    location: v.optional(v.string()),
    teachersReached: v.optional(v.number()),
    studentsReached: v.optional(v.number()),
    schoolsReached: v.optional(v.number()),
    testimonial: v.optional(v.string()),
    testimonialBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { activityId, ...updates } = args;
    const { person } = await requireCurrentPerson(ctx);
    const activity = await ctx.db.get(activityId);
    if (!activity) throw new Error("Activity not found");
    await requireProjectAccess(ctx, person, activity.projectId);
    await ctx.db.patch(activityId, updates);
    await scheduleActivityIngestion(ctx, activityId);
  },
});

export const updateExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    updates: v.object({
      categoryId: v.optional(v.id("budgetCategories")),
      spentOn: v.optional(v.string()),
      amount: v.optional(v.number()),
      description: v.optional(v.string()),
      paymentMode: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("draft"),
          v.literal("submitted"),
          v.literal("approved"),
          v.literal("rejected"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    await requireProjectAccess(ctx, person, expense.projectId);

    const nextCategoryId = args.updates.categoryId ?? expense.categoryId;
    const nextAmount = args.updates.amount ?? expense.amount;
    const nextStatus = args.updates.status ?? expense.status;
    const previousBudgetAmount = countsTowardBudget(expense.status) ? expense.amount : 0;
    const nextBudgetAmount = countsTowardBudget(nextStatus) ? nextAmount : 0;

    if (expense.categoryId === nextCategoryId) {
      const category = await ctx.db.get(expense.categoryId);
      if (category && previousBudgetAmount !== nextBudgetAmount) {
        await ctx.db.patch(category._id, {
          spentAmount: Math.max(0, category.spentAmount - previousBudgetAmount + nextBudgetAmount),
        });
      }
    } else {
      const oldCategory = await ctx.db.get(expense.categoryId);
      const newCategory = await ctx.db.get(nextCategoryId);
      if (oldCategory && previousBudgetAmount > 0) {
        await ctx.db.patch(oldCategory._id, {
          spentAmount: Math.max(0, oldCategory.spentAmount - previousBudgetAmount),
        });
      }
      if (newCategory && nextBudgetAmount > 0) {
        await ctx.db.patch(newCategory._id, {
          spentAmount: newCategory.spentAmount + nextBudgetAmount,
        });
      }
    }

    await ctx.db.patch(args.expenseId, args.updates);
  },
});

export const recordExpense = mutation({
  args: {
    projectId: v.id("projects"),
    categoryId: v.id("budgetCategories"),
    spentOn: v.string(),
    amount: v.number(),
    description: v.string(),
    paymentMode: v.optional(v.string()),
    submittedBy: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const expenseId = await ctx.db.insert("expenses", {
      ...args,
      status: "submitted",
    });

    const category = await ctx.db.get(args.categoryId);
    if (category) {
      await ctx.db.patch(args.categoryId, {
        spentAmount: category.spentAmount + args.amount,
      });
    }

    return expenseId;
  },
});

export const listExpenses = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("submitted"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (args.status) return expenses.filter((e) => e.status === args.status);
    return expenses;
  },
});

export const approveExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    approvedBy: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    await requireProjectAccess(ctx, person, expense.projectId);

    await ctx.db.patch(args.expenseId, {
      status: "approved",
      approvedBy: args.approvedBy,
    });
  },
});

export const rejectExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    approvedBy: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    await requireProjectAccess(ctx, person, expense.projectId);

    // Roll back the budget deduction when rejecting
    if (expense && expense.status === "submitted") {
      const category = await ctx.db.get(expense.categoryId);
      if (category) {
        await ctx.db.patch(expense.categoryId, {
          spentAmount: Math.max(0, category.spentAmount - expense.amount),
        });
      }
    }
    await ctx.db.patch(args.expenseId, {
      status: "rejected",
      approvedBy: args.approvedBy,
    });
  },
});

export const addDeliverable = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    target: v.optional(v.number()),
    unit: v.optional(v.string()),
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    return ctx.db.insert("deliverables", {
      ...args,
      achieved: 0,
      fiscalYear: fiscalYearForDate(args.dueDate),
      status: "not_started",
    });
  },
});

export const updateDeliverableProgress = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    achieved: v.number(),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const deliverable = await ctx.db.get(args.deliverableId);
    if (!deliverable) {
      throw new Error("Deliverable not found");
    }
    await requireProjectAccess(ctx, person, deliverable.projectId);

    const target = deliverable.target ?? 0;
    const status = target > 0 && args.achieved >= target ? "completed" : deliverable.status;

    await ctx.db.patch(args.deliverableId, {
      achieved: args.achieved,
      status,
    });
  },
});

export const updateDeliverable = mutation({
  args: {
    deliverableId: v.id("deliverables"),
    updates: v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      target: v.optional(v.number()),
      achieved: v.optional(v.number()),
      unit: v.optional(v.string()),
      dueDate: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("not_started"),
          v.literal("in_progress"),
          v.literal("completed"),
          v.literal("overdue"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const deliverable = await ctx.db.get(args.deliverableId);
    if (!deliverable) throw new Error("Deliverable not found");
    await requireProjectAccess(ctx, person, deliverable.projectId);

    await ctx.db.patch(args.deliverableId, {
      ...args.updates,
      ...(args.updates.dueDate !== undefined
        ? { fiscalYear: fiscalYearForDate(args.updates.dueDate) }
        : {}),
    });
  },
});

export const resolveAlert = mutation({
  args: {
    alertId: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }
    await requireProjectAccess(ctx, person, alert.projectId);

    await ctx.db.patch(args.alertId, {
      resolvedAt: Date.now(),
    });
  },
});

export const projectReportInputs = query({
  args: {
    projectId: v.id("projects"),
    periodStart: v.string(),
    periodEnd: v.string(),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const project = await ctx.db.get(args.projectId);
    const [deliverables, budgets, expenses, activities, milestones] = await Promise.all([
      ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("budgetCategories").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("expenses").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("milestones").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
    ]);

    const inPeriod = (date: string) => date >= args.periodStart && date <= args.periodEnd;

    return {
      project,
      deliverables,
      budgets,
      milestones,
      expenses: expenses.filter((expense) => inPeriod(expense.spentOn)),
      activities: activities.filter((activity) => inPeriod(activity.activityDate)),
    };
  },
});

export const saveReport = mutation({
  args: {
    projectId: v.id("projects"),
    reportType: v.union(v.literal("quarterly"), v.literal("full")),
    title: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    draft: v.string(),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const today = new Date().toISOString().slice(0, 10);
    const id = await ctx.db.insert("reports", {
      projectId: args.projectId,
      reportType: args.reportType,
      title: args.title,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      dueDate: today,
      fiscalYear: fiscalYearForDate(args.periodEnd),
      status: "draft",
      draft: args.draft,
      generatedAt: Date.now(),
    });
    await scheduleReportIngestion(ctx, id);
    return id;
  },
});

export const listReports = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    return ctx.db
      .query("reports")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const attachReceiptToExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    await requireProjectAccess(ctx, person, expense.projectId);

    await ctx.db.patch(args.expenseId, { receiptStorageId: args.storageId });
  },
});

export const fullProjectReportInputs = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const project = await ctx.db.get(args.projectId);
    const [deliverables, budgets, expenses, activities, milestones, alerts] = await Promise.all([
      ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("budgetCategories").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("expenses").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("milestones").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("alerts").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
    ]);

    return {
      project,
      deliverables,
      budgets,
      milestones,
      expenses,
      activities,
      alerts,
      approvedBudget: budgets.reduce((s, b) => s + b.approvedAmount, 0),
      spentBudget: budgets.reduce((s, b) => s + b.spentAmount, 0),
      deliverablesDone: deliverables.filter((d) => d.status === "completed").length,
      totalTeachersReached: activities.reduce((s, a) => s + (a.teachersReached ?? 0), 0),
      totalStudentsReached: activities.reduce((s, a) => s + (a.studentsReached ?? 0), 0),
      totalSchoolsReached: activities.reduce((s, a) => s + (a.schoolsReached ?? 0), 0),
    };
  },
});

export const logActivityInternal = internalMutation({
  args: {
    personId: v.id("people"),
    projectId: v.id("projects"),
    title: v.string(),
    activityDate: v.string(),
    state: v.optional(v.string()),
    location: v.optional(v.string()),
    teachersReached: v.optional(v.number()),
    studentsReached: v.optional(v.number()),
    schoolsReached: v.optional(v.number()),
    notes: v.optional(v.string()),
    testimonial: v.optional(v.string()),
    testimonialBy: v.optional(v.string()),
  },
  handler: async (ctx, { personId, ...args }) => {
    const id = await ctx.db.insert("activities", args);
    await scheduleActivityIngestion(ctx, id);
    return id;
  },
});

export const recordExpenseInternal = internalMutation({
  args: {
    personId: v.id("people"),
    projectId: v.id("projects"),
    categoryId: v.id("budgetCategories"),
    spentOn: v.string(),
    amount: v.number(),
    description: v.string(),
    paymentMode: v.optional(v.string()),
  },
  handler: async (ctx, { personId, ...args }) => {
    const expenseId = await ctx.db.insert("expenses", { ...args, status: "submitted" });
    const category = await ctx.db.get(args.categoryId);
    if (category) {
      await ctx.db.patch(args.categoryId, { spentAmount: category.spentAmount + args.amount });
    }
    return expenseId;
  },
});

export const updateDeliverableInternal = internalMutation({
  args: { deliverableId: v.id("deliverables"), achieved: v.number() },
  handler: async (ctx, { deliverableId, achieved }) => {
    await ctx.db.patch(deliverableId, { achieved });
  },
});
