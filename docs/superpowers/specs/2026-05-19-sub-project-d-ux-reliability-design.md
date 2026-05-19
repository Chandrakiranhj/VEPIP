# Sub-project D — UX & Reliability Hardening

**Date**: 2026-05-19
**Status**: Design (proceed-without-review). Continuous track in parallel with A/B/C.
**Part of**: VEPIP Intelligence Program Roadmap

---

## Problem

The AI surfaces work but have inconsistent reliability: cold-start delays on first request after deploy, occasional SSE stream cuts with no recovery, intake-routing misfires that turn structured requests into chat, opaque "something went wrong" failures, and a confirmation modal pattern that feels disconnected from the underlying mutation. None of these are project-ending bugs; together they make the system feel "AI-quality" rather than "product-quality".

## Principle

> If the user can't tell what the system is doing or why something failed, the answer is observability, not more model power.

## Five workstreams (independently shippable)

### D1. Tracing

- OpenTelemetry SDK in Next.js (`@opentelemetry/sdk-trace-node`) and the Python DeerFlow gateway (existing or added via `opentelemetry-instrumentation-fastapi`).
- One trace ID per chat send / per proactive event, propagated from `ai-chat.tsx` → `/api/ai/*` → DeerFlow → tool calls → Convex HTTP actions.
- Trace IDs surfaced in the UI in dev mode (small chip on each assistant message).
- Export: OTLP HTTP to a free Honeycomb dev tier or Grafana Tempo (configurable).
- Attribute allowlist (no PII): `project_id`, `tool_name`, `model_name`, `latency_ms`, `cache_hit`, `error_code`. **Never** the message body, user email, or document text.

### D2. Latency budget + warmup

- Targets: p50 first-token < 1.5 s, p95 < 4 s, p99 < 8 s.
- Vercel deploy hook (`vercel.json` `crons` or a GitHub Action) pings `/api/ai/health` after every prod deploy, which in turn pings DeerFlow `/api/exec/health` and the LLM provider via a zero-token health call.
- `pdf-parse` and Gemini SDK warm-loaded on Convex Node runtime via a dummy ingestion at deploy time.
- Latency dashboard auto-generated from the traces collected in D1.

### D3. Intake-routing test suite

- New `tests/ai/intake-routing.test.ts`: 100+ real user phrasings paired with expected route (`chat`, `report-generation`, `intake-extract`, `quick-write`).
- Run against the live router (Vercel function in a CI environment) using a sealed test deployment of Convex + DeerFlow.
- CI gate: every PR that touches `src/app/api/ai/**` or `convex/http.ts` runs the suite; must pass ≥ 95 % accuracy.
- Failing cases logged with diff for regression triage.

### D4. Inline diff confirmation

- Replace the existing confirm/cancel modal with an inline "proposed mutation" card under the assistant message.
- For each write (log_activity, record_expense, update_deliverable), render a typed card showing the row that would be created/updated, with editable fields.
- "Confirm" calls the Convex mutation; "Edit" puts the user into a small form; "Cancel" dismisses.
- Component: `src/app/(main)/_components/proposed-mutation-card.tsx` (NEW). DeerFlow emits a structured `mutation_proposal` custom stream event (uses the existing custom stream channel) carrying the typed payload.

### D5. Resumable SSE

- Client tracks `lastEventId` across the SSE read loop.
- On stream drop (network error, not user abort), client reconnects with `Last-Event-ID` header.
- Server (`/api/ai/stream` route) accepts `Last-Event-ID` and resumes the underlying DeerFlow run from that event index. DeerFlow `/api/runs/{rid}/join` already supports SSE join; route just needs to forward the resume request to the existing thread+run.
- After 3 failed reconnect attempts, surface a "Connection lost — retry?" inline pill instead of a generic error.

## Schema additions

None required for D1, D3, D4. D2 may add a small `aiHealth` table for last-warmed timestamps (deferred). D5 is stateless on the client; server resumes by run-id.

## Acceptance criteria

- **D1**: every chat send produces a complete end-to-end trace with the trace id visible in dev UI. No trace contains user message bodies.
- **D2**: p50 first-token latency in prod traces < 1.5 s over a 7-day rolling window.
- **D3**: intake-routing accuracy ≥ 95 % in CI on the golden set; zero `BUILD_FAILED` sentinels in a 30-day window.
- **D4**: every write operation goes through the inline card; the legacy modal is removed; users can edit a proposed activity before accepting.
- **D5**: a simulated 2-second connection drop mid-stream resumes without losing tokens and without the user needing to retype.

## Phases

| # | Workstream | First-week scope |
|---|---|---|
| D1 | Tracing | OTel SDK wiring in Next.js + Python; trace-id chip in dev UI |
| D2 | Latency + warmup | health endpoints + Vercel deploy ping; baseline latency capture |
| D3 | Routing suite | 100 phrasings collected, harness scaffolded, CI gate wired |
| D4 | Inline diff cards | replace modal for `log_activity` first; expand to other mutations |
| D5 | Resumable SSE | client-side reconnect with `lastEventId`; server-side resume |

## Out of scope

- A custom observability backend (use Honeycomb/Tempo).
- Replacing SSE with WebSockets (SSE works; resumability is the missing piece).
- A formal SLA / pager rotation (this is a single-org tool, not infra-on-call).
