import { v } from "convex/values";
import { authComponent, VE_EMAIL_DOMAIN } from "./auth";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isVisionEmpowerEmail(email: string) {
  return normalizeEmail(email).endsWith(`@${VE_EMAIL_DOMAIN}`);
}

export async function requireCurrentPerson(ctx: Ctx) {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  const email = normalizeEmail(String(authUser?.email ?? ""));

  if (!authUser || !email) {
    throw new Error("Not authenticated");
  }

  if (!isVisionEmpowerEmail(email)) {
    throw new Error(`Use your @${VE_EMAIL_DOMAIN} email address`);
  }

  const person = (await ctx.db
    .query("people")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique()) as Doc<"people"> | null;

  if (!person) {
    throw new Error("No Vision Empower user profile has been created for this account");
  }

  return { authUser, person };
}

export function canSeeAllProjects(person: Doc<"people">) {
  return person.role === "admin";
}

export async function canAccessProject(ctx: Ctx, person: Doc<"people">, projectId: Id<"projects">) {
  if (canSeeAllProjects(person)) {
    return true;
  }

  const project = (await ctx.db.get(projectId)) as Doc<"projects"> | null;
  if (!project) {
    return false;
  }

  if (project.programManagerId === person._id || project.accountManagerId === person._id) {
    return true;
  }

  const membership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_person", (q) => q.eq("projectId", projectId).eq("personId", person._id))
    .unique();

  return Boolean(membership);
}

export async function requireProjectAccess(ctx: Ctx, person: Doc<"people">, projectId: Id<"projects">) {
  if (!(await canAccessProject(ctx, person, projectId))) {
    throw new Error("You do not have access to this project");
  }
}

export const ROLE_HIERARCHY: Record<Doc<"people">["role"], number> = {
  admin: 100,
  leadership: 80,
  program_manager: 50,
  account_manager: 50,
  finance: 50,
};

export function canManageRole(creatorRole: Doc<"people">["role"], targetRole: Doc<"people">["role"]) {
  return ROLE_HIERARCHY[creatorRole] >= ROLE_HIERARCHY[targetRole];
}

export function requireLeadership(person: Doc<"people">) {
  if (!canSeeAllProjects(person)) {
    throw new Error("Admin access required");
  }
}

export function requireCanManageRole(creator: Doc<"people">, targetRole: Doc<"people">["role"]) {
  if (!canManageRole(creator.role, targetRole)) {
    throw new Error(`Your role (${creator.role}) cannot manage the ${targetRole} role`);
  }
}
