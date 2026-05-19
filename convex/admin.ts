/**
 * Admin-only reset utilities for production cutover.
 *
 * These mutations wipe transactional data (projects, activities, expenses,
 * AI tables, etc.) while preserving:
 *
 *   • people           — your team accounts + roles
 *   • better-auth      — login state (lives in its own component namespace)
 *   • states           — reference data
 *   • funders          — org-level master data (use `resetFunders` to also wipe)
 *   • schools          — master data (use `resetSchools` to also wipe)
 *   • fundVisibility / fyExpenditure — financial planning data
 *
 * All entry points require an `admin` role. Run from the Convex dashboard or:
 *   npx convex run admin:resetTransactionalData
 *   npx convex run admin:resetEntityCache
 *   npx convex run admin:resetFunders
 *   npx convex run admin:resetSchools
 *   npx convex run admin:fullProductionReset    # everything except people + states
 */
import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireCurrentPerson } from "./access";

async function requireAdmin(ctx: MutationCtx) {
  const { person } = await requireCurrentPerson(ctx);
  if (person.role !== "admin") {
    throw new Error("Only administrators may run reset operations");
  }
  return person;
}

async function deleteAll<T extends Parameters<MutationCtx["db"]["query"]>[0]>(
  ctx: MutationCtx,
  table: T,
): Promise<number> {
  const rows = await ctx.db.query(table).collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

/**
 * Wipe project transactional data + AI tables. Keeps people, states, funders,
 * schools, fundVisibility, fyExpenditure, and better-auth.
 *
 * Use this when you're about to onboard real production projects and want
 * the test data gone but want to keep your team accounts intact.
 */
export const resetTransactionalData = mutation({
  args: { confirm: v.optional(v.literal("YES")) },
  handler: async (ctx, { confirm }) => {
    await requireAdmin(ctx);
    if (confirm !== "YES") {
      throw new Error(
        "Pass { confirm: \"YES\" } to run. This deletes every project, deliverable, milestone, budget category, expense, activity, alert, report, testimonial, gallery item, AI suggestion, proactive event, document, document chunk, entity relation, and entity fact.",
      );
    }

    const stats: Record<string, number> = {};

    // ── Project tree ────────────────────────────────────────────────────
    stats.alerts = await deleteAll(ctx, "alerts");
    stats.testimonials = await deleteAll(ctx, "testimonials");
    stats.gallery = await deleteAll(ctx, "gallery");
    stats.expenses = await deleteAll(ctx, "expenses");
    stats.budgetCategories = await deleteAll(ctx, "budgetCategories");
    stats.activities = await deleteAll(ctx, "activities");
    stats.milestones = await deleteAll(ctx, "milestones");
    stats.deliverables = await deleteAll(ctx, "deliverables");
    stats.reports = await deleteAll(ctx, "reports");
    stats.projectMembers = await deleteAll(ctx, "projectMembers");
    stats.projects = await deleteAll(ctx, "projects");

    // ── AI tables ───────────────────────────────────────────────────────
    stats.aiSuggestions = await deleteAll(ctx, "aiSuggestions");
    stats.proactiveEvents = await deleteAll(ctx, "proactiveEvents");
    stats.documentChunks = await deleteAll(ctx, "documentChunks");
    stats.documents = await deleteAll(ctx, "documents");
    stats.entityRelations = await deleteAll(ctx, "entityRelations");
    stats.entityFacts = await deleteAll(ctx, "entityFacts");
    // Entity rows themselves rebuild from canonical tables on the nightly
    // cron — leaving them in place is fine, but their rollups will be stale
    // until the next rebuild. Clear them to be safe.
    stats.entities = await deleteAll(ctx, "entities");

    return stats;
  },
});

/**
 * Wipe just the AI entity graph cache. Safe to run anytime — the nightly
 * cron will rebuild from canonical tables.
 */
export const resetEntityCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const stats: Record<string, number> = {};
    stats.entityRelations = await deleteAll(ctx, "entityRelations");
    stats.entityFacts = await deleteAll(ctx, "entityFacts");
    stats.entities = await deleteAll(ctx, "entities");
    return stats;
  },
});

/**
 * Wipe funders. Only run if you also want to re-create them from scratch.
 * Note: projects reference funderId — call resetTransactionalData first.
 */
export const resetFunders = mutation({
  args: { confirm: v.optional(v.literal("YES")) },
  handler: async (ctx, { confirm }) => {
    await requireAdmin(ctx);
    if (confirm !== "YES") {
      throw new Error("Pass { confirm: \"YES\" } to run. This deletes all funders.");
    }
    // Guard: refuse if any project still references a funder.
    const projects = await ctx.db.query("projects").collect();
    if (projects.length > 0) {
      throw new Error(
        `Cannot wipe funders while ${projects.length} project(s) still exist. Run admin:resetTransactionalData first.`,
      );
    }
    return { funders: await deleteAll(ctx, "funders") };
  },
});

/**
 * Wipe schools master data.
 */
export const resetSchools = mutation({
  args: { confirm: v.optional(v.literal("YES")) },
  handler: async (ctx, { confirm }) => {
    await requireAdmin(ctx);
    if (confirm !== "YES") {
      throw new Error("Pass { confirm: \"YES\" } to run. This deletes all schools.");
    }
    return { schools: await deleteAll(ctx, "schools") };
  },
});

/**
 * Wipe financial planning tables (visibility + FY expenditure).
 */
export const resetFinancialPlanning = mutation({
  args: { confirm: v.optional(v.literal("YES")) },
  handler: async (ctx, { confirm }) => {
    await requireAdmin(ctx);
    if (confirm !== "YES") {
      throw new Error("Pass { confirm: \"YES\" } to run. This deletes fundVisibility and fyExpenditure rows.");
    }
    const stats: Record<string, number> = {};
    stats.fundVisibility = await deleteAll(ctx, "fundVisibility");
    stats.fyExpenditure = await deleteAll(ctx, "fyExpenditure");
    return stats;
  },
});

/**
 * Full production reset: wipes everything that's project-level OR master data
 * EXCEPT people and states. After this, the org has zero projects, zero
 * funders, zero schools, zero financial-planning rows, but all your admin /
 * leadership / PM accounts and the Indian states reference data are intact.
 *
 * Use this when starting from a true blank slate for production launch.
 */
export const fullProductionReset = mutation({
  args: { confirm: v.optional(v.literal("YES-WIPE-EVERYTHING-EXCEPT-PEOPLE")) },
  handler: async (ctx, { confirm }) => {
    await requireAdmin(ctx);
    if (confirm !== "YES-WIPE-EVERYTHING-EXCEPT-PEOPLE") {
      throw new Error(
        "Pass { confirm: \"YES-WIPE-EVERYTHING-EXCEPT-PEOPLE\" } to run. This is destructive and not reversible.",
      );
    }
    const stats: Record<string, number> = {};

    // Project tree
    stats.alerts = await deleteAll(ctx, "alerts");
    stats.testimonials = await deleteAll(ctx, "testimonials");
    stats.gallery = await deleteAll(ctx, "gallery");
    stats.expenses = await deleteAll(ctx, "expenses");
    stats.budgetCategories = await deleteAll(ctx, "budgetCategories");
    stats.activities = await deleteAll(ctx, "activities");
    stats.milestones = await deleteAll(ctx, "milestones");
    stats.deliverables = await deleteAll(ctx, "deliverables");
    stats.reports = await deleteAll(ctx, "reports");
    stats.projectMembers = await deleteAll(ctx, "projectMembers");
    stats.projects = await deleteAll(ctx, "projects");

    // AI tables
    stats.aiSuggestions = await deleteAll(ctx, "aiSuggestions");
    stats.proactiveEvents = await deleteAll(ctx, "proactiveEvents");
    stats.documentChunks = await deleteAll(ctx, "documentChunks");
    stats.documents = await deleteAll(ctx, "documents");
    stats.entityRelations = await deleteAll(ctx, "entityRelations");
    stats.entityFacts = await deleteAll(ctx, "entityFacts");
    stats.entities = await deleteAll(ctx, "entities");

    // Master data (now safe — projects are gone)
    stats.funders = await deleteAll(ctx, "funders");
    stats.schools = await deleteAll(ctx, "schools");

    // Financial planning
    stats.fundVisibility = await deleteAll(ctx, "fundVisibility");
    stats.fyExpenditure = await deleteAll(ctx, "fyExpenditure");

    return stats;
  },
});
