# Sub-project B — Org-wide Memory & Entity Graph

**Date**: 2026-05-19
**Status**: Design (proceed-without-review)
**Part of**: VEPIP Intelligence Program Roadmap
**Depends on**: Sub-project A (Grounding & RAG) — uses the same `documents` index for backing evidence

---

## Problem

DeerFlow's per-user JSON memory at `backend/.deer-flow/users/{userId}/memory.json` is a flat fact list with no entity model. Portfolio questions like "show me all our Karnataka activities this quarter", "which funders care about teacher training", or "who is the program manager across all our Wipro projects" cannot be answered without scanning every project tool-by-tool. There is no shared concept of *funder*, *region*, *theme*, or *person* that lives across project boundaries — even though the data exists in canonical Convex tables.

## Principle

> The entity graph is a cache, not a source of truth. Convex tables always win on conflict. Memory holds derived rollups + user-confirmed facts the canonical tables cannot express.

## Architecture

```
                Canonical Convex tables (source of truth)
                projects, funders, people, activities, states, ...
                              │
                              ▼  nightly + on-write
                ┌─────────────────────────────────┐
                │  Entity graph (derived cache)    │
                │  - entities (typed nodes)        │
                │  - entityFacts (memories)        │
                │  - entityRelations (edges)       │
                └─────────────────────────────────┘
                              │
                              ▼  HTTP tools
                ┌─────────────────────────────────┐
                │  DeerFlow tools                  │
                │  - query_portfolio(filter)       │
                │  - get_entity_profile(kind, id)  │
                │  - remember_fact(...)            │
                └─────────────────────────────────┘
```

## Schema additions (Convex, additive only)

```ts
entities: defineTable({
  kind: v.union(
    v.literal("funder"),
    v.literal("person"),
    v.literal("region"),
    v.literal("theme"),
    v.literal("school"),
  ),
  canonicalId: v.optional(v.string()),  // _id of source row when there is one
  name: v.string(),
  aliases: v.array(v.string()),
  rollup: v.any(),  // kind-specific JSON: counts, totals, latest dates
  updatedAt: v.number(),
}).index("by_kind", ["kind"])
  .index("by_canonical", ["kind", "canonicalId"]),

entityRelations: defineTable({
  fromKind: v.string(),
  fromId: v.id("entities"),
  toKind: v.string(),
  toId: v.id("entities"),
  via: v.string(),  // "funds", "manages", "operates_in", "implements"
  projectId: v.optional(v.id("projects")),
  weight: v.optional(v.number()),  // e.g. ₹ amount or activity count
  updatedAt: v.number(),
}).index("by_from", ["fromId", "via"])
  .index("by_to", ["toId", "via"]),

entityFacts: defineTable({
  entityId: v.id("entities"),
  fact: v.string(),
  source: v.union(v.literal("user_confirmed"), v.literal("derived"), v.literal("agent_inferred")),
  confidence: v.number(),  // 0..1
  createdBy: v.optional(v.id("people")),
  createdAt: v.number(),
}).index("by_entity", ["entityId"]),
```

`themes` are bootstrapped from a fixed seed list (`teacher_training`, `inclusive_curriculum`, `assistive_tech`, `parent_engagement`, `accessibility_audit`, `community_outreach`, `livelihoods`) and grow via `remember_fact`.

## Rebuild pipeline

A Convex internal action `aiEntities.rebuildAll` (nightly cron, also callable on-demand) walks the canonical tables and upserts `entities` and `entityRelations`:

| Source | Produces |
|---|---|
| `projects` | `funder ↔ project` relations (`funds`), `region ↔ project` relations (`operates_in`), person→project (`manages`/`accountable_for`) |
| `activities` | bumps `region.rollup.activity_count`, `region.rollup.teachers_reached`; school name → `school` entity if not present |
| `expenses` | rolls funder/region spend totals |
| `funders` | upserts funder entity with `canonicalId = funder._id` |
| `people` | upserts person entity with role |

User-confirmed facts (`entityFacts.source = "user_confirmed"`) are NEVER overwritten by the rebuild; they live alongside derived rollups.

## Retrieval contract

### `POST /ai/query-portfolio`
```json
{ "userEmail": "...", "filter": { "theme": "teacher_training", "region": "Karnataka", "fromDate": "2025-04-01", "toDate": "2026-03-31" } }
```
Returns aggregated rollup + list of `{projectId, name, status, fundingFunder, regionMatch, themeMatch, summaryUrl}` filtered by RBAC.

### `POST /ai/entity-profile`
```json
{ "userEmail": "...", "kind": "funder", "entityId": "..." }
```
Returns `{name, aliases, rollup, relatedProjects, recentActivities, recentReports, recentTestimonials, userConfirmedFacts}`.

### `POST /ai/remember-fact`
```json
{ "userEmail": "...", "entityKind": "funder", "entityId": "...", "fact": "...", "confidence": 0.95 }
```
RBAC: only admin/leadership/the person who manages a project related to the entity may write user-confirmed facts.

## DeerFlow tools

Add to `community/vepip/tools.py`:
- `query_portfolio(user_email, theme="", region="", funder="", from_date="", to_date="")`
- `get_entity_profile(user_email, kind, entity_id)`
- `remember_fact(user_email, entity_kind, entity_id, fact, confidence=0.9)`

SKILL.md gains a "Portfolio rule": when the user names a theme, funder, region, or asks comparative/aggregate questions across projects, call `query_portfolio` first.

## Memory deprecation path

DeerFlow's per-user JSON memory remains for ephemeral conversation state (preferred tone, recently active project). Cross-project knowledge migrates to the entity graph. Migration script reads existing `memory.json` facts and routes them into `entityFacts` where they match a known entity, or drops them if they don't.

## Cron

```ts
// convex/crons.ts
crons.daily("entity-graph-rebuild", { hourUTC: 1, minuteUTC: 30 }, internal.aiEntities.rebuildAll);
```

## Acceptance criteria

- "Show me all Karnataka activities this quarter" returns the correct set without the user naming a project (manual eval on 10 questions).
- Entity graph rebuild for the current DB completes in < 30 seconds.
- A user-confirmed fact survives the nightly rebuild (regression test).
- A program manager cannot read `entityFacts` for a project they don't have access to.
- Memory migration moves at least one cross-project fact into the graph without loss.

## Phases

| # | Deliverable | Files |
|---|---|---|
| 1 | Schema: entities, entityRelations, entityFacts | `convex/schema.ts` |
| 2 | Rebuild action | `convex/aiEntities.ts` (NEW) |
| 3 | Cron registration | `convex/crons.ts` |
| 4 | HTTP endpoints | `convex/http.ts` |
| 5 | DeerFlow tools | `deer-flow/backend/packages/harness/deerflow/community/vepip/tools.py` |
| 6 | SKILL.md portfolio rule | `deer-flow/skills/custom/vepip/SKILL.md` |
| 7 | UI: portfolio query results render with entity chips | `src/app/(main)/_components/ai-chat.tsx` |
| 8 | Migration script | `convex/migrations/entityGraph.ts` |

## Out of scope

- A standalone entity browser UI (defer to dedicated dashboard project).
- Full-text fuzzy entity resolution beyond `aliases[]`.
- Cross-org entities (multi-tenant deferred).
