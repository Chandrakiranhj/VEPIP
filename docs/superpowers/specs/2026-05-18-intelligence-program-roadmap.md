# VEPIP Intelligence Program — Roadmap

**Date**: 2026-05-18
**Status**: Approved (program-level)
**Scope**: Four sequenced sub-projects that evolve VEPIP's AI from intent-classifier-plus-report-renderer into a portfolio-aware co-pilot.

---

## Goal

Make VEPIP's project intelligence systems substantially better along four axes — output quality, organisational memory, proactive autonomy, and day-to-day reliability — without rebuilding the platform, without breaking the Convex schema, and without abandoning the DeerFlow sidecar that already exists.

## Non-goals

- Replacing DeerFlow or LangGraph.
- Breaking changes to the Convex schema (additive tables only).
- A net-new chat UI; `src/app/(main)/_components/ai-chat.tsx` evolves in place.
- Multi-tenant beyond VisionEmpower.
- Native mobile app.

## Current state (one paragraph)

DeerFlow runs as a Python FastAPI + LangGraph sidecar with per-user JSON memory. Seven Convex HTTP endpoints (project-context, log-activity, record-expense, update-deliverable, add-milestone, add-testimonial, org-summary, write-alert, report-data) expose the data layer behind a shared `VEPIP_INTERNAL_SECRET`. Chat is SSE-streamed with one persistent thread per project. A weekly Convex cron triggers an org-wide risk sweep that writes alerts. Document generation (pptx/docx/pdf) was recently split off the agent path into a deterministic exec route. What is missing: any retrieval over uploaded documents and past report narratives, any cross-project entity model, any event-driven autonomy beyond the weekly cron, and any latency/quality observability.

## The four sub-projects

| # | Name | Depends on | One-line outcome |
|---|---|---|---|
| **A** | Grounding & RAG | — | Every agent answer can cite live retrieval over project documents, past reports, and activity narratives. |
| **B** | Org-wide memory & entity graph | A | Portfolio-level questions (by funder, region, theme, person) work without naming a project. |
| **C** | Proactive autonomy | A, B | Event-driven triggers draft reports, surface digests, and prefill forms from uploads — not just a weekly sweep. |
| **D** | UX & reliability hardening | parallel | Latency targets met, intake routing CI-gated, streaming recoverable, confirmation inline. |

## Sequencing

```
Week 1-2 ─► A. Grounding & RAG  ──────────► A ships
                                              │
Week 1-N ─► D. UX hardening (continuous track, in parallel with A/B/C)
                                              │
Week 3-4 ─► B. Org-wide memory  ──────► B ships
                                              │
Week 5-6 ─► C. Proactive autonomy ──► C ships
```

D is treated as a continuous track because each of A/B/C surfaces its own reliability work and the hardening compounds.

## Sub-project sketches

The roadmap commits to the *what* and the *order*. Each sub-project gets its own brainstorming cycle, deep design spec, and writing-plans plan before code lands.

### A. Grounding & RAG

Two new Convex tables (`documents`, `documentChunks`), one new HTTP endpoint (`POST /ai/search-knowledge`), one new DeerFlow tool (`search_knowledge(query, filters)`), one ingestion pipeline (Convex internal action that chunks new docs and writes embeddings using Gemini `text-embedding-004`), and one chat-UI change (inline citation chips). Sources indexed: project descriptions, uploaded MoUs/proposals, generated reports, activity narratives, testimonials, meeting notes. Top-k retrieval is filterable by `projectId`, `docType`, `dateRange`. Full design in `2026-05-18-sub-project-a-grounding-rag-design.md`.

### B. Org-wide memory & entity graph

Replace DeerFlow's per-user JSON memory with a Convex-backed `aiMemory` table holding two kinds of records: **facts** (typed entity relationships — funder↔project, region↔activity, person↔role) and **preferences** (per-user reporting style, common terminology). Add tools `query_portfolio(filter)`, `get_entity_profile(kind, id)`, `remember_fact(...)`. The entity graph is derived nightly from the canonical Convex tables (it is a cache, not a source of truth) plus user-confirmed memories. Full design TBD in its own brainstorming session.

### C. Proactive autonomy

Expand the weekly cron into an event-driven layer with three trigger classes: **scheduled** (deliverable due-date − 7 days, report period close, funder reporting cadence), **threshold** (budget utilisation > 90%, activity-log silence > 21 days, deliverable progress flat-lined for 30 days), and **upload** (when a PDF/email/photo is uploaded, DeerFlow extracts structured activities/expenses for confirmation). Output lands in a new `aiSuggestions` table that the UI surfaces as an inbox. Nothing writes to live tables without human confirmation. Full design TBD in its own brainstorming session.

### D. UX & reliability hardening

Five workstreams, each independently shippable: (1) OpenTelemetry trace from `ai-chat.tsx` through `/api/ai/*` into DeerFlow with one trace-id per request; (2) latency budget p50 < 1.5s first token / p95 < 4s with a cold-start warmup ping on deploy; (3) intake-routing test suite — 100+ real user phrasings, golden expected intents, CI gate; (4) replace the confirm/cancel modal with inline diff cards rendering the proposed Convex mutation as readable JSON-diff; (5) resumable SSE with `Last-Event-ID`. Full design TBD; each workstream is small enough to brainstorm in 15 minutes.

## Success criteria

The program is "100×" — measured as concrete user-visible behaviour, not vibes — when:

- **A**: 20-question blind grounding eval → ≥ 80 % of answers cite at least one retrieved source and contain no hallucinated facts.
- **B**: "Show me all our Karnataka activities this quarter" and "which funders care about teacher training" return correct, complete results without the user naming any project.
- **C**: Per active project per quarter, at least one auto-drafted report, one weekly digest, and one upload-extracted activity are accepted (not rejected) by the responsible PM.
- **D**: p50 first-token < 1.5 s in prod traces, zero `BUILD_FAILED` sentinels in any 30-day window, intake-routing accuracy ≥ 95 % on the golden set in CI.

## What does not change

- Convex schema (additive only — new tables, no field changes to existing tables).
- Better-auth, RBAC, `requireProjectAccess` pattern.
- All existing pages, dashboards, CRM, finance, analytics surfaces.
- The DeerFlow Python sidecar, its config, its middleware chain, its sandbox model.
- The deterministic doc-gen exec path (specced 2026-05-12, do not regress it).

## Risks at the program level

| Risk | Mitigation |
|---|---|
| Building B/C without A's grounding produces a more confident hallucinator | A is a hard dependency, enforced by sequencing. |
| Convex embedding storage costs unbounded as projects grow | Document chunks are scoped per project; quarterly retention review; embeddings are 768-dim (Gemini), not 3072. |
| Entity graph in B drifts from canonical tables | B's entity graph is a nightly-rebuilt cache, never a source of truth; canonical tables always win on conflict. |
| Proactive autonomy in C feels noisy or wrong | All C output lands in `aiSuggestions` for explicit human confirmation; no autonomous writes to live tables. |
| D's tracing leaks PII into logs | OTel attributes redacted by an allowlist; trace IDs never include user identifiers. |

## Out-of-scope, deliberately

- Replacing Gemini with a different LLM family.
- Fine-tuning a custom model.
- Voice in chat (multilingual voice exists elsewhere; not part of this program).
- Multi-org / white-label.
- A reporting BI layer (use the data, do not rebuild Metabase).

## Next action

Brainstorming for sub-project A is complete; its design spec is committed at `2026-05-18-sub-project-a-grounding-rag-design.md`. After human review of that spec, the next step is to invoke the writing-plans skill to produce an implementation plan for A. B, C, and D each begin their own brainstorming cycles when prioritised.
