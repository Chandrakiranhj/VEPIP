# Deterministic Document Generation — Design Spec

**Date**: 2026-05-12
**Status**: Approved (Sub-project A of "Make DeerFlow extremely powerful")
**Approach**: Non-agentic exec endpoint in DeerFlow + LLM-only-for-narrative split

---

## Problem

`/api/ai/generate-document` uses a full lead-agent (Gemini Flash + 18-middleware chain + sandbox lifecycle + thread state + ClarificationMiddleware + LoopDetectionMiddleware) to perform two trivial actions: drop a JSON file and run `python build_pptx.py`. Every observed failure (Markdown fallback, retry-loop exhaustion, ModuleNotFound, hallucinated paths, "BUILD_FAILED" token) is the agent layer mis-behaving on deterministic work. The render scripts are already deterministic; the agent role is dead-weight orchestration.

## Principle

> LLM reasoning lives in DeerFlow's agent runtime. Deterministic execution lives in DeerFlow's host but bypasses the agent.

## Architecture

```
Vercel Next.js               DeerFlow host (one box)
─────────────────            ─────────────────────────────────────
/api/ai/generate-document ─► POST /api/exec/render-report
                             (non-agentic, NO LangGraph, NO middleware chain)
                                │
                                ├─► [optional] narrative_blocks via Gemini
                                │   (direct langchain_google_genai call, no agent)
                                │
                                ├─► subprocess: python build_<fmt>.py --data … --output …
                                │   stdout streamed to SSE
                                │
                                └─► file written to .deer-flow/reports/{report_id}/<fname>
                                    SSE final event: {reportId, downloadUrl, bytes}

/api/ai/exec-artifact/{report_id}/{filename}
   ─► GET /api/exec/artifact/{report_id}/{filename}
      (file bytes, content-disposition: attachment)
```

## Contract

### POST /api/exec/render-report
**Auth**: `Authorization: Bearer <VEPIP_INTERNAL_SECRET>` (env-shared with Vercel; CSRF + JWT bypassed via path exemption)
**Body**:
```json
{
  "format": "pptx" | "docx" | "pdf",
  "report_type": "quarterly" | "full",
  "project_id": "string",
  "project_name": "string",
  "filename": "string",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "vibe": "editorial-serif" | "dark-premium" | "magazine-bold" | "ocean-corporate" | null,
  "data": {...merged project_context + report_data...},
  "generate_narrative": true,
  "narrative_model": "gemini-2.5-flash"  // optional
}
```

**Response**: `text/event-stream`, events:
- `init` — `{report_id, download_url, filename}`
- `narrative` — `{step, text}` (one per section: intro, achievements, challenges, way_forward)
- `render-start` — `{script, cmd}`
- `render-log` — `{line}` (subprocess stdout/stderr lines)
- `render-complete` — `{bytes, output_path}`
- `done` — `{}`
- `error` — `{message, code}` (terminal)

### GET /api/exec/artifact/{report_id}/{filename}
**Auth**: same Bearer secret
**Response**: file bytes, `Content-Disposition: attachment`, `Cache-Control: private, no-store`

### Storage
- Reports: `deer-flow/backend/.deer-flow/reports/{report_id}/{filename}` (outside per-user thread isolation; reports are tied to Convex `project_id`, not a DeerFlow user)
- Cleanup: nightly cron deletes reports older than 30 days. (Not in v1 — manual sweep ok.)

## Error Model
- Bad auth → 401, JSON `{error: "unauthorized"}`
- Validation fail → 400, JSON `{error, field}`
- Build script non-zero exit → final SSE `error` event with stderr tail + 500 close
- Narrative LLM failure → log + continue with empty narrative; render still succeeds

## Security
- New paths added to both `_PUBLIC_EXACT_PATHS` (auth_middleware) and `_AUTH_EXEMPT_PATHS` (csrf_middleware) in DeerFlow.
- Endpoint validates `Authorization: Bearer <VEPIP_INTERNAL_SECRET>` using `secrets.compare_digest`.
- `report_id` server-generated UUID4 (not client-supplied) to prevent path-traversal collisions.
- `filename` allow-list: matches `^[A-Za-z0-9_.-]+\.(pptx|docx|pdf)$`.
- Script path is hardcoded server-side (not from request body).

## What is removed

- Lead-agent invocation in doc-gen path
- `vepip-reports` skill prompt complexity, the 3-attempt retry budget, the "BUILD_FAILED" sentinel, the "no markdown fallback" hardening — all become moot once the LLM isn't orchestrating
- The doc-gen-specific thread state under `backend/.deer-flow/users/.../threads/...`
- Artifact route's reliance on `threadId` for report downloads (chat artifacts still use the existing route)

## What is kept

- `/api/ai/extract-project` (intake) — genuine LLM reasoning, stays agentic
- `/api/ai/stream` (chat) — genuine LLM reasoning, stays agentic
- `/api/ai/analyze-projects` (weekly cron) — genuine LLM reasoning, stays agentic
- Existing `vepip-reports` skill scripts — unchanged; we just call them differently

## Implementation Phases

| # | Deliverable | Files |
|---|---|---|
| 1 | DeerFlow non-agentic exec router | `deer-flow/backend/app/gateway/routers/exec_render.py` (NEW), `auth_middleware.py`, `csrf_middleware.py`, `app.py` |
| 2 | Vercel-side rewrite | `src/app/api/ai/generate-document/route.ts`, `src/lib/deerflow.ts` |
| 3 | Artifact proxy | `src/app/api/ai/exec-artifact/[reportId]/[filename]/route.ts` (NEW) |
| 4 | UI thread-key change | `ai-chat.tsx` / wherever the artifact URL is consumed (only if URL shape changes) |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Vercel cold-start + long subprocess time | DeerFlow side is long-running; Vercel proxy holds open SSE only as long as upstream streams. `maxDuration = 600` already set. |
| Subprocess hangs | 5-min hard timeout on `asyncio.create_subprocess_exec`; kill + 504. |
| Narrative LLM slow blocks rendering | Render starts immediately after narrative; if narrative > 60s, render proceeds without it. |
| `_bootstrap.py` cold install on first call | First call is slow (~30s), subsequent are instant. Warm by health-check on deploy. |
| Disk fill from old reports | 30-day cleanup cron (deferred to v2; manual sweep documented). |
