import { v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
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

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    return ctx.db
      .query("milestones")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    return ctx.db.insert("milestones", {
      ...args,
      fiscalYear: fiscalYearForDate(args.dueDate),
      status: "not_started",
    });
  },
});

export const updateStatus = mutation({
  args: {
    milestoneId: v.id("milestones"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("overdue"),
    ),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new Error("Milestone not found");
    await requireProjectAccess(ctx, person, milestone.projectId);

    await ctx.db.patch(args.milestoneId, {
      status: args.status,
      completedAt: args.status === "completed" ? new Date().toISOString().slice(0, 10) : undefined,
    });
  },
});

export const update = mutation({
  args: {
    milestoneId: v.id("milestones"),
    updates: v.object({
      title: v.optional(v.string()),
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
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new Error("Milestone not found");
    await requireProjectAccess(ctx, person, milestone.projectId);

    await ctx.db.patch(args.milestoneId, {
      ...args.updates,
      ...(args.updates.dueDate !== undefined
        ? { fiscalYear: fiscalYearForDate(args.updates.dueDate) }
        : {}),
      ...(args.updates.status !== undefined
        ? { completedAt: args.updates.status === "completed" ? new Date().toISOString().slice(0, 10) : undefined }
        : {}),
    });
  },
});

export const addInternal = internalMutation({
  args: { projectId: v.id("projects"), title: v.string(), dueDate: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("milestones", {
      ...args,
      fiscalYear: fiscalYearForDate(args.dueDate),
      status: "not_started",
    });
  },
});

export const remove = mutation({
  args: { milestoneId: v.id("milestones") },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) return;
    await requireProjectAccess(ctx, person, milestone.projectId);

    await ctx.db.delete(args.milestoneId);
  },
});
