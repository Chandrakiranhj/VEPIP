import { v } from "convex/values";
import { requireCurrentPerson, requireProjectAccess } from "./access";
import { mutation, query } from "./_generated/server";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCurrentPerson(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireCurrentPerson(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const saveActivityEvidence = mutation({
  args: {
    activityId: v.id("activities"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    await requireProjectAccess(ctx, person, activity.projectId);

    const existing = activity.evidenceStorageIds ?? [];
    await ctx.db.patch(args.activityId, {
      evidenceStorageIds: [...existing, args.storageId],
    });
  },
});

export const removeActivityEvidence = mutation({
  args: {
    activityId: v.id("activities"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) return;
    await requireProjectAccess(ctx, person, activity.projectId);

    await ctx.db.patch(args.activityId, {
      evidenceStorageIds: (activity.evidenceStorageIds ?? []).filter(
        (id) => id !== args.storageId,
      ),
    });
    await ctx.storage.delete(args.storageId);
  },
});

export const getActivityUrls = query({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    await requireCurrentPerson(ctx);
    return Promise.all(
      args.storageIds.map(async (id) => ({
        storageId: id,
        url: await ctx.storage.getUrl(id),
      })),
    );
  },
});
