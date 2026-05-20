import { v } from "convex/values";
import { authComponent, VE_EMAIL_DOMAIN, SUPER_ADMIN_EMAIL } from "./auth";
import { canSeeAllProjects, normalizeEmail, requireCanManageRole, requireCurrentPerson, requireLeadership, requireProjectAccess } from "./access";
import { internalQuery, mutation, query } from "./_generated/server";

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("leadership"),
  v.literal("program_manager"),
  v.literal("account_manager"),
  v.literal("finance"),
);

export const current = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    const email = normalizeEmail(String(authUser?.email ?? ""));

    if (!authUser || !email) {
      return null;
    }

    const person = await ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", email)).unique();
    return person ? { ...person, canSeeAllProjects: canSeeAllProjects(person) } : null;
  },
});

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    const email = normalizeEmail(String(authUser?.email ?? ""));

    if (!authUser || !email) {
      throw new Error("Not authenticated");
    }

    if (!email.endsWith(`@${VE_EMAIL_DOMAIN}`)) {
      throw new Error(`Use your @${VE_EMAIL_DOMAIN} email address`);
    }

    const existing = await ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", email)).unique();
    const authUserId = String(authUser._id);
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { authUserId, updatedAt: now });
      return existing._id;
    }

    // Bootstrap Superadmin or default to program_manager if pre-added
    const role = email === SUPER_ADMIN_EMAIL ? "admin" : "program_manager";

    return await ctx.db.insert("people", {
      name: String(authUser.name ?? email.split("@")[0]),
      email,
      role,
      authUserId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const bootstrapSuperAdmin = mutation({
  args: {
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bootstrapPassword = process.env.SUPERADMIN_INITIAL_PASSWORD;
    if (!bootstrapPassword || args.password !== bootstrapPassword) {
      throw new Error("Invalid superadmin bootstrap password");
    }

    const email = SUPER_ADMIN_EMAIL;
    const now = Date.now();
    const existing = await ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", email)).unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name ?? existing.name,
        role: "admin",
        tempPassword: args.password,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("people", {
      name: args.name ?? "Chandrakiran",
      email,
      role: "admin",
      tempPassword: args.password,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { person } = await requireCurrentPerson(ctx);
    requireLeadership(person);
    return ctx.db.query("people").collect();
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: roleValidator,
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const { person: creator } = await requireCurrentPerson(ctx);
    requireCanManageRole(creator, args.role);

    const email = normalizeEmail(args.email);
    if (!email.endsWith(`@${VE_EMAIL_DOMAIN}`)) {
      throw new Error(`Use a @${VE_EMAIL_DOMAIN} email address`);
    }

    const existing = await ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (existing) {
      throw new Error("A user profile already exists for this email");
    }

    const now = Date.now();
    return ctx.db.insert("people", {
      name: args.name,
      email,
      role: args.role,
      tempPassword: args.password,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRole = mutation({
  args: {
    personId: v.id("people"),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const { person: creator } = await requireCurrentPerson(ctx);
    requireCanManageRole(creator, args.role);

    const target = await ctx.db.get(args.personId);
    if (!target) throw new Error("User not found");
    requireCanManageRole(creator, target.role);

    await ctx.db.patch(args.personId, { role: args.role, updatedAt: Date.now() });
  },
});

export const assignToProject = mutation({
  args: {
    projectId: v.id("projects"),
    personId: v.optional(v.id("people")),
    projectRole: v.optional(v.string()),
    programManagerId: v.optional(v.id("people")),
    accountManagerId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    const { person } = await requireCurrentPerson(ctx);
    await requireProjectAccess(ctx, person, args.projectId);
    requireLeadership(person);

    if (args.programManagerId || args.accountManagerId) {
      await ctx.db.patch(args.projectId, {
        programManagerId: args.programManagerId,
        accountManagerId: args.accountManagerId,
        updatedAt: Date.now(),
      });
    }

    const personId = args.personId;
    if (!personId) {
      return args.projectId;
    }

    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_person", (q) => q.eq("projectId", args.projectId).eq("personId", personId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      personId,
      role: args.projectRole,
      createdAt: Date.now(),
    });
  },
});
export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", email)).unique();
  },
});

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    if (!authUser?.email) return null;
    return ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", authUser.email!.toLowerCase())).unique();
  },
});

export const remove = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    const { person: creator } = await requireCurrentPerson(ctx);
    if (creator.role !== "admin") {
      throw new Error("Only administrators can delete users");
    }

    const target = await ctx.db.get(args.personId);
    if (!target) return;

    // Prevent deleting oneself
    if (target._id === creator._id) {
      throw new Error("You cannot delete your own administrator account");
    }

    // If linked to auth, we should ideally delete the auth user too.
    // Better Auth manages this, but we can at least remove our record.
    if (target.authUserId) {
      // Logic to delete from better-auth tables if needed, 
      // but for now removing from 'people' blocks their access due to requireCurrentPerson
    }

    await ctx.db.delete(args.personId);
  },
});
