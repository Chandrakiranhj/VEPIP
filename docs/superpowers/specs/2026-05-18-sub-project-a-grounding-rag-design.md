# Sub-project A — Grounding & RAG over VEPIP Knowledge

**Date**: 2026-05-18
**Status**: Approved (design level), pending user review of this spec
**Part of**: VEPIP Intelligence Program Roadmap (`2026-05-18-intelligence-program-roadmap.md`)
**Approach**: Convex-native vector store + Gemini `text-embedding-004` + new `search_knowledge` DeerFlow tool + citation chips in chat.

---

## Problem

Today the DeerFlow agent only sees what the seven Convex HTTP endpoints return — structured fields from `projects`, `deliverables`, `activities`, `expenses`, `milestones`. None of the rich text content lives in that surface: uploaded MoUs and proposals (`projects.mouStorageId`, `projects.proposalStorageId`), past report drafts (`reports.draft`), activity narratives (`activities.notes`), testimonials (`testimonials.content`), meeting notes (none today — to be added). When a PM asks "what did our last quarterly report say about teacher reach in Karnataka", the agent has nothing to retrieve from and either makes up an answer or asks the user to paste it back in. This is the single largest cause of low-quality output, and it blocks every other improvement in the program.

## Principle

> The agent must never need to invent text that already exists in our system. Every claim of fact in an answer must be traceable to a retrieved source or a structured query result.

## Architecture

```
┌──────────────────────────────────────┐
│  VEPIP (Next.js + Convex)            │
│                                      │
│  Upload / mutation                   │
│      │                               │
│      ▼                               │
│  documents table  ──► internal       │
│      │              action: ingest   │
│      │                   │           │
│      │                   ▼           │
│      │              Gemini embed     │
│      │              (text-embedding- │
│      │               004, 768-dim)   │
│      │                   │           │
│      │                   ▼           │
│      │              documentChunks   │
│      │              (with vectorIdx) │
│      ▼                               │
│  POST /ai/search-knowledge ◄────┐    │
│       (HTTP action)             │    │
│           │                     │    │
│           │ top-k results       │    │
│           ▼                     │    │
│      JSON response              │    │
└─────────────────────────────────┼────┘
                                  │
                                  │ Bearer VEPIP_INTERNAL_SECRET
                                  │
┌─────────────────────────────────┼────┐
│  DeerFlow sidecar (Python)      │    │
│                                 │    │
│  search_knowledge(query,        │    │
│    filters) tool ───────────────┘    │
│           │                          │
│           ▼                          │
│  Lead agent receives chunks +        │
│  source metadata; cites in answer    │
└──────────────────────────────────────┘
                                  │
                                  ▼
              ai-chat.tsx renders citation chips
              that expand into source previews
```

## Schema additions (Convex, additive only)

```ts
documents: defineTable({
  projectId: v.optional(v.id("projects")),  // null for org-level docs
  kind: v.union(
    v.literal("project_summary"),
    v.literal("mou"),
    v.literal("proposal"),
    v.literal("report_draft"),
    v.literal("activity_note"),
    v.literal("testimonial"),
    v.literal("meeting_note"),
    v.literal("uploaded_pdf"),
  ),
  sourceTable: v.optional(v.string()),         // e.g. "activities"
  sourceId: v.optional(v.string()),            // _id from that table
  storageId: v.optional(v.id("_storage")),     // for uploaded files
  title: v.string(),
  text: v.string(),                            // full extracted text
  textHash: v.string(),                        // sha256 of text — skip re-embed if unchanged
  createdAt: v.number(),
  indexedAt: v.optional(v.number()),
})
  .index("by_project", ["projectId"])
  .index("by_kind", ["kind"])
  .index("by_source", ["sourceTable", "sourceId"]),

documentChunks: defineTable({
  documentId: v.id("documents"),
  projectId: v.optional(v.id("projects")),     // denormalised for filter performance
  kind: v.string(),                            // denormalised
  chunkIndex: v.number(),
  text: v.string(),
  embedding: v.array(v.float64()),             // length 768
  createdAt: v.number(),
})
  .index("by_document", ["documentId"])
  .index("by_project", ["projectId"])
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 768,
    filterFields: ["projectId", "kind"],
  }),
```

Notes:
- `textHash` lets the ingestion action short-circuit when nothing changed — re-running ingest is cheap.
- `projectId` and `kind` are denormalised onto chunks so the vector index can filter without joins.
- 768 dims is Gemini `text-embedding-004`'s native size — small enough to keep Convex storage modest, large enough for good recall.

## Ingestion pipeline

A single Convex internal action `ai.ingestDocument` (in `convex/aiIngest.ts`):

1. Accept `{ documentId }`.
2. Load the `documents` row.
3. If `textHash === existing chunks' source hash` → no-op.
4. Otherwise: delete existing chunks for that documentId, chunk the text (recursive 1000-char chunks with 200-char overlap), embed each chunk via Gemini, write chunk rows.

**Trigger points** — internal mutation hooks on the canonical tables (added to existing mutation files, not new wrappers):

| Source | When | Document construction |
|---|---|---|
| `projects` create/update | on mutation | One doc per project (kind `project_summary`), text = name + summary + funderName + states + grant + dates |
| `projects.mouStorageId` set | on mutation | Schedule action to fetch storage file, run PDF→text, write doc kind `mou` |
| `projects.proposalStorageId` set | on mutation | Same as MoU, kind `proposal` |
| `reports.draft` set | on mutation | Doc kind `report_draft`, text = draft |
| `activities` create | on mutation | Doc kind `activity_note`, text = title + notes + testimonial |
| `testimonials` create | on mutation | Doc kind `testimonial`, text = content + author + role |
| File upload via `convex/files.ts` (PDF) | on mutation | Doc kind `uploaded_pdf` |

PDF text extraction runs in a Convex Node-runtime action using `pdf-parse`. Failures log a `documents.text = "[extraction failed: …]"` placeholder rather than blocking the mutation.

**Backfill**: a one-shot `ai.backfillAllDocuments` internal action iterates every row in every source table and enqueues ingestion. Idempotent (hash check).

## Retrieval contract

### `POST /ai/search-knowledge` (Convex HTTP action)

**Auth**: `Authorization: Bearer <VEPIP_INTERNAL_SECRET>` (same pattern as the other seven endpoints; reuses `verifyInternalRequest`).

**Request**:
```json
{
  "userEmail": "chandrakiran@visionempowertrust.org",
  "query": "teacher reach numbers from last Karnataka quarterly",
  "topK": 8,
  "filters": {
    "projectId": "...",       // optional
    "kind": ["report_draft", "activity_note"],  // optional
    "dateFrom": "2025-10-01", // optional, ISO date, filters documents.createdAt
    "dateTo": "2025-12-31"
  }
}
```

**Response**:
```json
{
  "results": [
    {
      "chunkId": "...",
      "documentId": "...",
      "score": 0.83,
      "text": "...the chunk text...",
      "source": {
        "kind": "report_draft",
        "title": "Q3 2025 Quarterly Report — Karnataka Education",
        "projectId": "...",
        "projectName": "Karnataka Education Initiative",
        "sourceTable": "reports",
        "sourceId": "...",
        "createdAt": 1733000000000
      }
    }
  ],
  "elapsedMs": 142
}
```

Server-side: embed the query via Gemini, call Convex `vectorSearch` on `documentChunks.by_embedding` with the supplied filter fields, then re-fetch parent `documents` rows for metadata in a single batch.

### DeerFlow tool

`deer-flow/skills/custom/vepip/tools.py` gains one function:

```python
@tool
def search_knowledge(
    query: str,
    project_id: str | None = None,
    kinds: list[str] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    top_k: int = 8,
) -> list[dict]:
    """Search VEPIP's knowledge base (project documents, past reports,
    activity narratives, testimonials, uploaded MoUs/proposals) using
    semantic similarity. Returns ranked text chunks with source metadata.
    Always prefer this over fabricating quotes or numbers from documents."""
    ...
```

The VEPIP SKILL.md (`deer-flow/skills/custom/vepip/SKILL.md`) gains a "Grounding rule" section:

> When asked about anything narrative — past report contents, what an MoU committed to, what was discussed in a meeting, what an activity report described — you MUST call `search_knowledge` first. Quote retrieved chunks inline as `[source: <title>]`. Never invent quoted text. If `search_knowledge` returns no results, say so explicitly.

## Citation rendering in chat

`ai-chat.tsx` already streams SSE tokens. The agent's responses gain a structured trailing event when a `search_knowledge` call occurred:

```
event: citations
data: {"chunks":[{"chunkId":"...","documentId":"...","title":"Q3 2025 Quarterly Report","kind":"report_draft","snippet":"...","projectId":"..."}]}
```

The chat component:
1. Renders the assistant message text as today.
2. On `citations` event, appends a row of citation chips at the bottom of the message bubble.
3. On chip click, opens a side panel (existing `_components/` pattern — reuse the alerts side panel shell) showing the chunk text and a "Open source" button that deep-links to the report / project / activity page.

Inline citations `[source: Title]` in the streamed text are styled as superscript links to the matching chip.

## Security & access control

- The HTTP endpoint requires the shared `VEPIP_INTERNAL_SECRET` and a `userEmail` field (same pattern as the seven existing endpoints).
- Server-side, after looking up the `people` row, the search **filters chunks by project visibility**: only chunks whose `projectId` the user has access to via `projectMembers` (or for admin/leadership roles, all chunks) are returned.
- Org-level docs (`projectId == null`) are visible to admin and leadership only.
- The Bearer secret never reaches the browser; DeerFlow holds it; the chat goes browser → Next.js → DeerFlow.

## Cost & performance

- **Embedding cost**: Gemini `text-embedding-004` is $0.00001 per 1k input chars at current pricing. Initial backfill estimate: ~5 MB of text across all current VEPIP data → ~$0.05 one-off. Incremental ingestion negligible.
- **Storage**: 768 floats × 8 bytes = 6 KB per chunk. ~5 chunks per typical document, ~500 documents at maturity → ~15 MB of embedding data. Well within Convex defaults.
- **Latency budget**: `search_knowledge` end-to-end p95 ≤ 400 ms (embedding ~150 ms, vector search ~50 ms, metadata fetch ~50 ms, network overhead ~150 ms). The agent's overall response latency is dominated by Gemini generation, not retrieval.

## Error model

| Failure | Behaviour |
|---|---|
| Embedding API down | Log + return `{ "results": [], "error": "embedding_unavailable" }`; agent told to proceed without retrieval and to flag uncertainty in its answer. |
| Vector search returns 0 hits | Empty `results` array; agent must say "no sources found" rather than fabricate. |
| PDF extraction fails during ingest | Document row created with placeholder text; surfaced in an admin "needs reindex" view (deferred to v2). |
| Chunk filter results in 0 accessible chunks (RBAC) | Identical to "no hits"; agent says "no sources found". |

## What this sub-project does NOT do

- Does not build the entity graph (sub-project B).
- Does not change any existing Convex tables (additive only).
- Does not change DeerFlow's middleware chain.
- Does not add new agentic capabilities — the agent gains one tool and a grounding rule.
- Does not handle non-text uploads (images, video) — those land in `documents` as future stubs but are not indexed.

## Implementation phases

| # | Deliverable | Files |
|---|---|---|
| 1 | Schema: `documents`, `documentChunks` tables with vector index | `convex/schema.ts` |
| 2 | Ingestion action: chunking + embed + write | `convex/aiIngest.ts` (NEW), `convex/_generated/api` regenerated |
| 3 | PDF text extraction action (Node runtime) | `convex/aiIngest.ts` (Node-runtime sibling), `package.json` (+`pdf-parse`) |
| 4 | Mutation hooks on `projects`, `activities`, `reports`, `testimonials`, `files` | `convex/projects.ts`, `convex/operations.ts`, `convex/impact.ts`, `convex/files.ts` |
| 5 | Backfill action | `convex/aiIngest.ts` (`backfillAllDocuments`) |
| 6 | `POST /ai/search-knowledge` HTTP endpoint with RBAC | `convex/http.ts` |
| 7 | DeerFlow `search_knowledge` tool + SKILL.md grounding rule | `deer-flow/skills/custom/vepip/tools.py`, `deer-flow/skills/custom/vepip/SKILL.md` |
| 8 | Chat UI citation chips + side-panel viewer | `src/app/(main)/_components/ai-chat.tsx`, possibly `_components/citation-panel.tsx` (NEW) |
| 9 | Blind eval harness — 20 questions, score groundedness | `tests/ai/grounding-eval.ts` (NEW); manual run, not CI |

## Acceptance criteria

- Backfill completes against current dev DB with no extraction errors above 5 %.
- A chat question that requires document content ("summarise our last Karnataka report") triggers a `search_knowledge` tool call (visible in DeerFlow trace) and the rendered answer contains at least one citation chip linking to a real report.
- Searching for a phrase that does not exist in any document returns "no sources found" without fabrication (manually verified on 5 nonsense queries).
- A user with no membership on Project X cannot retrieve chunks tagged with Project X's `projectId` (verified via Convex test with two user identities).
- 20-question blind eval ≥ 80 % grounded (no hallucinated facts, ≥ 1 citation per applicable question).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Convex vector index quotas | Stay on the included tier; 15 MB embedding storage and ~100 searches/day are well inside limits. Monitor in Convex dashboard monthly. |
| PDF extraction quality varies wildly | Accept noisy text in v1; flag low-confidence extractions for manual review in v2. |
| Agent ignores the grounding rule | The SKILL.md rule is reinforced by tool description; if violations persist, add a middleware check that flags answers containing quoted text without preceding `search_knowledge` calls. |
| Re-embedding on every minor edit is wasteful | `textHash` short-circuits unchanged content. |
| RBAC filter bug leaks cross-project chunks | Two-user integration test gates merge. |

## Out-of-scope, deferred to later sub-projects

- Cross-project / org-level retrieval as a first-class query mode (B).
- Auto-summarising retrieved chunks into a "knowledge card" UI (later UX).
- Image / chart understanding from uploaded PDFs.
- Hybrid lexical + vector search (BM25 fallback).
- Re-ranking with a cross-encoder model.

## Next action

After human review of this spec, invoke the writing-plans skill to break the nine implementation phases into atomic, reviewable tasks with explicit verification at each step.
