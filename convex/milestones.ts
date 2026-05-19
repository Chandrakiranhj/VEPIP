import { v } from "convex/values";
import { requireCurrentPerson, requireProjectAccess } from "./access";
import { internalMutation, mutation, query } from "./_generated/server";

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

export const addInternal = internalMutation({
  args: { projectId: v.id("projects"), title: v.string(), dueDate: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("milestones", { ...args, status: "not_started" });
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
