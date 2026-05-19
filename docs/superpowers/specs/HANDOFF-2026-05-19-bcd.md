# Sub-projects B + C + D — Handoff (2026-05-19)

**Commit `702e77c`** — `feat(ai): sub-projects B (org memory) + C (proactive) + D4/D5 (chat UX)`

---

## B — Org-wide memory & entity graph

### What landed

- **Schema** (`convex/schema.ts`, additive): `entities`, `entityRelations`, `entityFacts`.
- **Rebuild pipeline** (`convex/aiEntities.ts`): `clearDerived` → `upsertEntity` for funders / people / states / themes → `upsertRelation` for funder→project, PM→project, region→project, theme→project. Region rollups derived from activities. User-confirmed facts survive the rebuild.
- **Cron** (`convex/crons.ts`): `entity-graph-rebuild` daily at 01:30 UTC.
- **HTTP endpoints** in `convex/http.ts`:
  - `POST /ai/query-portfolio` — filters by theme/region/funder/dateRange, RBAC-scoped via `getAccessibleProjectIds`.
  - `POST /ai/entity-profile` — returns rollup + facts + relations for one entity.
  - `POST /ai/remember-fact` — admin/leadership only.
- **DeerFlow tools** (`deer-flow/backend/packages/harness/deerflow/community/vepip/tools.py`): `query_portfolio`, `get_entity_profile`, `remember_fact` registered with docstrings the agent can read.
- **SKILL.md** gains a mandatory "Portfolio rule" — agent must call `query_portfolio` for cross-project / aggregate questions instead of looping `get_project_context`.

### Activation

1. `npx convex dev` to regenerate types — new modules `aiEntities`, `aiProactive` will populate `_generated/api`.
2. From the Convex dashboard: `npx convex run aiEntities:rebuildAll` (one-shot manual run, then cron handles it).
3. Restart DeerFlow so the new tools are loaded.
4. Verify in the chat: ask "show me all our Karnataka activities" — the agent should call `query_portfolio` (visible in the tool-call chip) before answering.

---

## C — Proactive autonomy

### What landed

- **Schema** (`convex/schema.ts`, additive): `aiSuggestions` (status enum + project/status index for fast inbox queries), `proactiveEvents`.
- **Threshold scanner** (`convex/aiProactive.ts` → `scanThresholds`, hourly cron):
  - Budget utilisation ≥ 90 % → `kind: alert`, severity watch.
  - Activity silence > 21 days → `kind: alert`, severity watch.
  - Deliverable at risk (< 90 % achieved, due within ±30 days) → `kind: alert`, severity watch/critical based on whether overdue.
- **Schedule scanner** (`scanSchedules`, daily cron):
  - Deliverable due in 7 days / 1 day → `kind: alert`.
  - Report period close (today is `periodEnd` of a draft report) → `kind: report_draft`.
  - Quarterly funder cadence (1st of Jan/Apr/Jul/Oct + funder.reportingCadence mentions "quarter") → `kind: report_draft`.
- **Dedup** on `(kind, projectId, sourceRef)` — re-running the scan updates the existing pending row, never piles duplicates.
- **UI**: new `/inbox` page with Pending / Accepted / Dismissed tabs, suggestion cards grouped by project, accept/dismiss/edit actions wired to canonical mutations. Activity/expense prefills render their payload inline for inspection.
- **Accept flow**: `acceptSuggestion` flips status and — for `alert` kinds — inserts a row in the canonical `alerts` table so the existing alerts UI picks it up.

### Activation

1. The crons run automatically once `npx convex dev` regenerates types and pushes the schema.
2. The Inbox is reachable at `/inbox`. **Not yet wired into the sidebar nav** — add it to `dashboard/_components/sidebar/app-sidebar.tsx`'s nav config when you want it surfaced (likely a top-level item with the suggestions-count badge).
3. Force a test run from Convex dashboard: `npx convex run aiProactive:scanThresholds` and `npx convex run aiProactive:scanSchedules`.

### Out of scope (deferred)

- Email/Slack notifications for new pending suggestions — the inbox is pull-based in v1.
- Upload-driven prefill (PDF → activity extraction) — schema supports it (`source: "upload"`, `kind: "activity_prefill"`); the agent-side extraction tool is not yet implemented.
- Per-PM digest aggregation — `kind: "digest"` schema slot exists; generator not built.
- Auto-accept for trusted suggestion types — humans confirm everything in v1.

---

## D — UX hardening (D4 + D5)

### D4 — Inline diff confirmation cards

`src/app/(main)/_components/ai-chat.tsx`:
- Parses `<!--vepip-proposal:{json}-->` HTML-comment markers from assistant text.
- Renders each marker as an inline amber proposal card (tool name, summary, argument list, Cancel + Confirm buttons).
- Confirm button sends `"Yes, please go ahead and save <tool>"` as the next user message; Cancel sends a negative confirmation. The agent then executes (or skips) the actual tool call.
- The marker is stripped from the rendered text so the user sees only the natural prose + the card.

`deer-flow/skills/custom/vepip/SKILL.md` rule 4 rewritten to teach the agent the exact format (one block per pending write, camelCase args matching the Convex contract, one-sentence summary).

### D5 — Resumable SSE (pragmatic)

When the chat SSE stream fails mid-response, the panel:
1. Doesn't replace the assistant bubble with a generic "something went wrong" — keeps whatever partial content streamed.
2. Shows an amber "Connection lost mid-stream" pill above the input with a Retry button.
3. Retry replays the last user message via `sendMessage(last, { recordUser: false })` so the user doesn't see a duplicate in the transcript.

This is the pragmatic D5: not full `Last-Event-ID` resume (which would need DeerFlow protocol changes), but a one-click fix that doesn't make the user retype. The original spec's full resume is still tracked in `2026-05-19-sub-project-d-ux-reliability-design.md`.

### Deferred D-track workstreams

D1 (OTel tracing), D2 (latency budget + warmup), D3 (intake-routing CI gate) all need external infra (Honeycomb / Tempo, Vercel deploy hook, CI environment with sealed Convex+DeerFlow). Specs remain in `2026-05-19-sub-project-d-ux-reliability-design.md` for future sessions.

---

## Files added / modified in this commit

| File | Status |
|---|---|
| `convex/schema.ts` | + entities, entityRelations, entityFacts, aiSuggestions, proactiveEvents |
| `convex/aiEntities.ts` | New — rebuild pipeline + queries |
| `convex/aiProactive.ts` | New — scanners + listForUser + accept/dismiss/edit mutations |
| `convex/crons.ts` | + entity-graph-rebuild (daily), threshold-scan (hourly), schedule-scan (daily) |
| `convex/http.ts` | + /ai/query-portfolio, /ai/entity-profile, /ai/remember-fact |
| `src/app/(main)/inbox/page.tsx` | New — inbox UI |
| `src/app/(main)/_components/ai-chat.tsx` | Proposal cards (D4), connection-lost retry (D5) |
| `deer-flow/.../vepip/tools.py` | + query_portfolio, get_entity_profile, remember_fact (on disk only — deer-flow tree untracked) |
| `deer-flow/skills/custom/vepip/SKILL.md` | + Portfolio rule, rewritten confirm-before-write rule (on disk only) |

---

## Verification checklist

1. **Schema push**: `npx convex dev` → no validator errors.
2. **Entity rebuild**: `npx convex run aiEntities:rebuildAll` → returns `{ funders, people, regions, themes, projectsWalked, activitiesWalked }`.
3. **Portfolio query** via chat: "show me all our Karnataka projects" → agent calls `query_portfolio` (visible in tool chip) → returns list.
4. **Proactive scan**: `npx convex run aiProactive:scanThresholds` → check `/inbox` for newly-created pending alerts.
5. **Inbox accept flow**: Accept an alert-kind suggestion → it disappears from Pending, a row appears in the canonical `alerts` table.
6. **D4 proposal card**: Trigger a write in chat ("log a school visit in Mysore today, 30 teachers trained"). Agent should emit a `vepip-proposal` block; UI should render an amber card. Click Confirm → agent calls the tool.
7. **D5 retry**: Kill the dev server mid-stream → connection-lost pill appears → click Retry → message replays.

---

## What I did NOT do (deliberate)

- Did not run `npx convex dev`, `convex run`, or any deploy command.
- Did not commit the deer-flow changes (tools.py + SKILL.md) — the deer-flow tree is untracked in this repo. Commit them wherever DeerFlow's source lives.
- Did not wire `/inbox` into the sidebar nav — `app-sidebar.tsx` is outside this work's scope. Add an entry there to surface the link with a live count badge.
- Did not implement upload-driven activity prefill (kind `activity_prefill`) — needs an agent-side extractor that doesn't exist yet.
- Did not implement D1 (OTel), D2 (latency dashboards), or D3 (intake-routing CI suite) — all need external infra.
