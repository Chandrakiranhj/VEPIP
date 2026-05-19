import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

// ── Theme seed list (sub-project B) ──────────────────────────────────────────

const SEED_THEMES: Array<{ name: string; aliases: string[] }> = [
  { name: "Teacher Training", aliases: ["teacher_training", "trainings", "teacher capacity"] },
  { name: "Inclusive Curriculum", aliases: ["curriculum", "inclusive_curriculum", "lesson plans"] },
  { name: "Assistive Tech", aliases: ["assistive_tech", "assistive devices", "screen readers"] },
  { name: "Parent Engagement", aliases: ["parent_engagement", "family outreach"] },
  { name: "Accessibility Audit", aliases: ["accessibility_audit", "audits", "compliance"] },
  { name: "Community Outreach", aliases: ["community_outreach", "advocacy"] },
  { name: "Livelihoods", aliases: ["livelihoods", "employment", "vocational"] },
];

const KIND_VALIDATOR = v.union(
  v.literal("funder"),
  v.literal("person"),
  v.literal("region"),
  v.literal("theme"),
  v.literal("school"),
);

type EntityKind = "funder" | "person" | "region" | "theme" | "school";

function tagThemes(text: string): string[] {
  const t = (text || "").toLowerCase();
  const matched: string[] = [];
  for (const theme of SEED_THEMES) {
    const all = [theme.name.toLowerCase(), ...theme.aliases.map((a) => a.toLowerCase())];
    if (all.some((kw) => kw.length > 3 && t.includes(kw))) {
      matched.push(theme.name);
    }
  }
  return matched;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

export const upsertEntity = internalMutation({
  args: {
    kind: KIND_VALIDATOR,
    canonicalId: v.optional(v.string()),
    name: v.string(),
    aliases: v.optional(v.array(v.string())),
    rollup: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<Id<"entities">> => {
    let existing: Doc<"entities"> | null = null;
    if (args.canonicalId) {
      existing = await ctx.db
        .query("entities")
        .withIndex("by_canonical", (q) =>
          q.eq("kind", args.kind).eq("canonicalId", args.canonicalId),
        )
        .unique();
    }
    if (!existing) {
      // Match by name within kind (case-insensitive).
      const sameKind = await ctx.db
        .query("entities")
        .withIndex("by_kind", (q) => q.eq("kind", args.kind))
        .collect();
      const lower = args.name.trim().toLowerCase();
      existing = sameKind.find(
        (e) => e.name.trim().toLowerCase() === lower ||
               e.aliases.some((a) => a.trim().toLowerCase() === lower),
      ) ?? null;
    }
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        canonicalId: args.canonicalId ?? existing.canonicalId,
        aliases: Array.from(new Set([...existing.aliases, ...(args.aliases ?? [])])),
        rollup: args.rollup ?? existing.rollup,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("entities", {
      kind: args.kind,
      canonicalId: args.canonicalId,
      name: args.name,
      aliases: args.aliases ?? [],
      rollup: args.rollup ?? {},
      updatedAt: now,
    });
  },
});

export const upsertRelation = internalMutation({
  args: {
    fromKind: v.string(),
    fromId: v.id("entities"),
    toKind: v.string(),
    toId: v.id("entities"),
    via: v.string(),
    projectId: v.optional(v.id("projects")),
    weight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("entityRelations")
      .withIndex("by_from", (q) => q.eq("fromId", args.fromId).eq("via", args.via))
      .collect();
    const dup = existing.find(
      (r) => r.toId === args.toId && r.projectId === args.projectId,
    );
    const now = Date.now();
    if (dup) {
      await ctx.db.patch(dup._id, { weight: args.weight, updatedAt: now });
      return dup._id;
    }
    return ctx.db.insert("entityRelations", {
      fromKind: args.fromKind,
      fromId: args.fromId,
      toKind: args.toKind,
      toId: args.toId,
      via: args.via,
      projectId: args.projectId,
      weight: args.weight,
      updatedAt: now,
    });
  },
});

// Wipe derived entries before rebuild — user-confirmed facts are preserved.
export const clearDerived = internalMutation({
  args: {},
  handler: async (ctx) => {
    const entities = await ctx.db.query("entities").collect();
    for (const e of entities) {
      // Keep entity rows (they may have user-confirmed facts attached) — just
      // reset the rollup so the rebuild repopulates from scratch.
      await ctx.db.patch(e._id, { rollup: {}, updatedAt: Date.now() });
    }
    const relations = await ctx.db.query("entityRelations").collect();
    for (const r of relations) {
      await ctx.db.delete(r._id);
    }
  },
});

// ── Rebuild action: walks canonical tables, upserts entities + relations ─────

export const rebuildAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled?: number; funders?: number; people?: number; regions?: number; themes?: number; projectsWalked?: number; activitiesWalked?: number }> => {
    await ctx.runMutation(internal.aiEntities.clearDerived, {});

    // Seed themes first so they have stable IDs to relate against.
    const themeIds = new Map<string, Id<"entities">>();
    for (const theme of SEED_THEMES) {
      const id: Id<"entities"> = await ctx.runMutation(internal.aiEntities.upsertEntity, {
        kind: "theme",
        name: theme.name,
        aliases: theme.aliases,
      });
      themeIds.set(theme.name, id);
    }

    return ctx.runMutation(internal.aiEntities.rebuildSync, {
      themeIds: Array.from(themeIds.entries()).map(([name, id]) => ({ name, id })),
    });
  },
});

export const rebuildSync = internalMutation({
  args: {
    themeIds: v.array(v.object({ name: v.string(), id: v.id("entities") })),
  },
  handler: async (ctx, { themeIds }) => {
    const themeMap = new Map(themeIds.map((t) => [t.name, t.id]));

    // ── Funders ───────────────────────────────────────────────────────────
    const funders = await ctx.db.query("funders").collect();
    const funderIds = new Map<string, Id<"entities">>();
    for (const f of funders) {
      const id = await ctx.runMutation(internal.aiEntities.upsertEntity, {
        kind: "funder",
        canonicalId: f._id,
        name: f.name,
        rollup: {
          contactName: f.contactName,
          contactEmail: f.contactEmail,
          reportingCadence: f.reportingCadence,
        },
      });
      funderIds.set(f._id, id);
    }

    // ── People ────────────────────────────────────────────────────────────
    const people = await ctx.db.query("people").collect();
    const personIds = new Map<string, Id<"entities">>();
    for (const p of people) {
      const id = await ctx.runMutation(internal.aiEntities.upsertEntity, {
        kind: "person",
        canonicalId: p._id,
        name: p.name,
        rollup: { role: p.role, email: p.email },
      });
      personIds.set(p._id, id);
    }

    // ── Regions (states from existing `states` table) ─────────────────────
    const states = await ctx.db.query("states").collect();
    const regionIds = new Map<string, Id<"entities">>();
    for (const s of states) {
      const id = await ctx.runMutation(internal.aiEntities.upsertEntity, {
        kind: "region",
        canonicalId: s._id,
        name: s.name,
        aliases: [s.code],
        rollup: { code: s.code, activity_count: 0, teachers_reached: 0, students_reached: 0 },
      });
      regionIds.set(s.name.toLowerCase(), id);
      regionIds.set(s.code.toLowerCase(), id);
    }

    // ── Projects → funder/person/region/theme relations ───────────────────
    const projects = await ctx.db.query("projects").collect();
    for (const proj of projects) {
      // funder relation
      if (proj.funderId && funderIds.has(proj.funderId)) {
        const funderEntId = funderIds.get(proj.funderId)!;
        await ctx.runMutation(internal.aiEntities.upsertRelation, {
          fromKind: "funder",
          fromId: funderEntId,
          toKind: "funder",
          toId: funderEntId,
          via: "funds",
          projectId: proj._id,
          weight: proj.grantAmount,
        });
      } else if (proj.funderName) {
        // Funder named on the project but no funders row — create a stub.
        const stubId = await ctx.runMutation(internal.aiEntities.upsertEntity, {
          kind: "funder",
          name: proj.funderName,
        });
        await ctx.runMutation(internal.aiEntities.upsertRelation, {
          fromKind: "funder",
          fromId: stubId,
          toKind: "funder",
          toId: stubId,
          via: "funds",
          projectId: proj._id,
          weight: proj.grantAmount,
        });
      }
      // PM / AM
      for (const [field, role] of [
        [proj.programManagerId, "manages"],
        [proj.accountManagerId, "accountable_for"],
      ] as const) {
        if (field && personIds.has(field)) {
          const personEnt = personIds.get(field)!;
          await ctx.runMutation(internal.aiEntities.upsertRelation, {
            fromKind: "person",
            fromId: personEnt,
            toKind: "person",
            toId: personEnt,
            via: role,
            projectId: proj._id,
            weight: 1,
          });
        }
      }
      // Regions
      for (const stateStr of proj.states ?? []) {
        const regionEnt = regionIds.get((stateStr ?? "").toLowerCase());
        if (regionEnt) {
          await ctx.runMutation(internal.aiEntities.upsertRelation, {
            fromKind: "region",
            fromId: regionEnt,
            toKind: "region",
            toId: regionEnt,
            via: "operates_in",
            projectId: proj._id,
            weight: 1,
          });
        }
      }
      // Themes (tag from project summary + name)
      const projText = `${proj.name} ${proj.summary ?? ""}`;
      for (const themeName of tagThemes(projText)) {
        const themeEnt = themeMap.get(themeName);
        if (themeEnt) {
          await ctx.runMutation(internal.aiEntities.upsertRelation, {
            fromKind: "theme",
            fromId: themeEnt,
            toKind: "theme",
            toId: themeEnt,
            via: "implements",
            projectId: proj._id,
            weight: 1,
          });
        }
      }
    }

    // ── Activities → region rollups ───────────────────────────────────────
    const activities = await ctx.db.query("activities").collect();
    const regionRollups: Map<Id<"entities">, { activities: number; teachers: number; students: number; schools: number }> = new Map();
    for (const a of activities) {
      if (!a.state) continue;
      const regionEnt = regionIds.get(a.state.toLowerCase());
      if (!regionEnt) continue;
      const r = regionRollups.get(regionEnt) ?? { activities: 0, teachers: 0, students: 0, schools: 0 };
      r.activities += 1;
      r.teachers += a.teachersReached ?? 0;
      r.students += a.studentsReached ?? 0;
      r.schools += a.schoolsReached ?? 0;
      regionRollups.set(regionEnt, r);
    }
    for (const [entId, r] of regionRollups) {
      const ent = await ctx.db.get(entId);
      if (!ent) continue;
      const oldRollup = (ent.rollup as Record<string, unknown>) ?? {};
      await ctx.db.patch(entId, {
        rollup: {
          ...oldRollup,
          activity_count: r.activities,
          teachers_reached: r.teachers,
          students_reached: r.students,
          schools_reached: r.schools,
        },
        updatedAt: Date.now(),
      });
    }

    return {
      funders: funderIds.size,
      people: personIds.size,
      regions: regionIds.size / 2,  // duplicated by name+code
      themes: themeMap.size,
      projectsWalked: projects.length,
      activitiesWalked: activities.length,
    };
  },
});

// ── Query helpers used by the HTTP endpoints ─────────────────────────────────

export const portfolioByFilter = internalQuery({
  args: {
    accessibleProjectIds: v.array(v.id("projects")),
    seeAll: v.boolean(),
    theme: v.optional(v.string()),
    region: v.optional(v.string()),
    funder: v.optional(v.string()),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allProjects = await ctx.db.query("projects").collect();
    const candidateProjects = args.seeAll
      ? allProjects
      : allProjects.filter((p) => args.accessibleProjectIds.includes(p._id));

    const filterId = (entityKind: EntityKind, hint?: string): Id<"entities"> | undefined => {
      if (!hint) return undefined;
      const lower = hint.trim().toLowerCase();
      // We can't easily index across all entities by name fragment without
      // a search index, so brute-force scan within kind.
      // (Volumes here are small — entity rows count in dozens, not thousands.)
      return undefined;
    };

    // Filter by relations via the entityRelations table.
    let matchingProjectIds = new Set(candidateProjects.map((p) => p._id));

    async function intersectByVia(via: string, entityFilter: (e: Doc<"entities">) => boolean) {
      const entities = await ctx.db.query("entities").collect();
      const matching = entities.filter(entityFilter);
      const projectIdsByRelation = new Set<Id<"projects">>();
      for (const ent of matching) {
        const rels = await ctx.db
          .query("entityRelations")
          .withIndex("by_from", (q) => q.eq("fromId", ent._id).eq("via", via))
          .collect();
        for (const r of rels) {
          if (r.projectId) projectIdsByRelation.add(r.projectId);
        }
      }
      matchingProjectIds = new Set(
        [...matchingProjectIds].filter((id) => projectIdsByRelation.has(id)),
      );
    }

    if (args.theme) {
      const themeLower = args.theme.toLowerCase();
      await intersectByVia("implements", (e) =>
        e.kind === "theme" && (
          e.name.toLowerCase().includes(themeLower) ||
          e.aliases.some((a) => a.toLowerCase().includes(themeLower))
        ),
      );
    }
    if (args.region) {
      const regionLower = args.region.toLowerCase();
      await intersectByVia("operates_in", (e) =>
        e.kind === "region" && (
          e.name.toLowerCase().includes(regionLower) ||
          e.aliases.some((a) => a.toLowerCase().includes(regionLower))
        ),
      );
    }
    if (args.funder) {
      const funderLower = args.funder.toLowerCase();
      await intersectByVia("funds", (e) =>
        e.kind === "funder" && (
          e.name.toLowerCase().includes(funderLower) ||
          e.aliases.some((a) => a.toLowerCase().includes(funderLower))
        ),
      );
    }

    const finalProjects = candidateProjects.filter((p) => matchingProjectIds.has(p._id));

    // Date filter (date overlap with project term)
    const matchesDate = (p: Doc<"projects">) => {
      if (!args.fromDate && !args.toDate) return true;
      const from = args.fromDate ? Date.parse(args.fromDate) : 0;
      const to = args.toDate ? Date.parse(args.toDate) : Number.MAX_SAFE_INTEGER;
      const projFrom = p.startDate ? Date.parse(p.startDate) : 0;
      const projTo = p.endDate ? Date.parse(p.endDate) : Number.MAX_SAFE_INTEGER;
      return projTo >= from && projFrom <= to;
    };

    const filtered = finalProjects.filter(matchesDate);

    // Aggregate rollup for the response
    let totalGrant = 0;
    let totalSpent = 0;
    let activeCount = 0;
    for (const p of filtered) {
      totalGrant += p.grantAmount ?? 0;
      if (p.status !== "completed") activeCount += 1;
      const budgets = await ctx.db
        .query("budgetCategories")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      totalSpent += budgets.reduce((s, b) => s + (b.spentAmount ?? 0), 0);
    }

    return {
      total: filtered.length,
      activeCount,
      totalGrant,
      totalSpent,
      filter: {
        theme: args.theme ?? null,
        region: args.region ?? null,
        funder: args.funder ?? null,
        fromDate: args.fromDate ?? null,
        toDate: args.toDate ?? null,
      },
      projects: filtered.map((p) => ({
        id: p._id,
        name: p.name,
        funderName: p.funderName,
        status: p.status,
        states: p.states,
        startDate: p.startDate,
        endDate: p.endDate,
        grantAmount: p.grantAmount,
      })),
    };
  },
});

export const entityProfile = internalQuery({
  args: {
    accessibleProjectIds: v.array(v.id("projects")),
    seeAll: v.boolean(),
    kind: KIND_VALIDATOR,
    entityId: v.id("entities"),
  },
  handler: async (ctx, args) => {
    const ent = await ctx.db.get(args.entityId);
    if (!ent || ent.kind !== args.kind) return null;
    const facts = await ctx.db
      .query("entityFacts")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .collect();
    const outgoing = await ctx.db
      .query("entityRelations")
      .filter((q) => q.eq(q.field("fromId"), args.entityId))
      .collect();
    const visibleRelations = args.seeAll
      ? outgoing
      : outgoing.filter(
          (r) => !r.projectId || args.accessibleProjectIds.includes(r.projectId),
        );
    return {
      id: ent._id,
      kind: ent.kind,
      name: ent.name,
      aliases: ent.aliases,
      rollup: ent.rollup,
      facts: facts.map((f) => ({
        id: f._id,
        fact: f.fact,
        source: f.source,
        confidence: f.confidence,
        createdAt: f.createdAt,
      })),
      relations: visibleRelations.map((r) => ({
        via: r.via,
        projectId: r.projectId,
        weight: r.weight,
      })),
    };
  },
});

export const rememberFactInternal = internalMutation({
  args: {
    entityId: v.id("entities"),
    fact: v.string(),
    confidence: v.optional(v.number()),
    createdBy: v.id("people"),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("entityFacts", {
      entityId: args.entityId,
      fact: args.fact.trim().slice(0, 500),
      source: "user_confirmed",
      confidence: args.confidence ?? 0.9,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
  },
});

// Public-ish query for the UI sidebar (if surfaced later).
export const listAllEntities = internalQuery({
  args: { kind: v.optional(KIND_VALIDATOR) },
  handler: async (ctx, { kind }) => {
    if (kind) {
      return ctx.db.query("entities").withIndex("by_kind", (q) => q.eq("kind", kind)).collect();
    }
    return ctx.db.query("entities").collect();
  },
});
