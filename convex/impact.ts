import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, query } from "./_generated/server";
import { requireCurrentPerson, requireProjectAccess } from "./access";

async function scheduleTestimonialIngestion(ctx: MutationCtx, testimonialId: Id<"testimonials">) {
  const t = await ctx.db.get(testimonialId);
  if (!t) return;
  await ctx.scheduler.runAfter(0, internal.aiIngest.upsertAndSchedule, {
    projectId: t.projectId,
    kind: "testimonial",
    sourceTable: "testimonials",
    sourceId: testimonialId,
    title: `${t.author}${t.role ? ` (${t.role})` : ""}`,
    text: t.content,
  });
}

export const addTestimonial = mutation({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    author: v.string(),
    role: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    const id = await ctx.db.insert("testimonials", {
      ...args,
      createdAt: Date.now(),
    });
    await scheduleTestimonialIngestion(ctx, id);
    return id;
  },
});

export const addGalleryItem = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);

    return await ctx.db.insert("gallery", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const addTestimonialInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    author: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("testimonials", { ...args, createdAt: Date.now() });
    await scheduleTestimonialIngestion(ctx, id);
    return id;
  },
});

export const removeGalleryItem = mutation({
  args: { galleryId: v.id("gallery") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.galleryId);
    if (!item) throw new Error("Item not found");
    
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, item.projectId);

    await ctx.storage.delete(item.storageId);
    await ctx.db.delete(args.galleryId);
  },
});
