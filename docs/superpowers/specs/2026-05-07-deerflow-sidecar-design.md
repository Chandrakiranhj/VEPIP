# DeerFlow AI Sidecar for VEPIP — Design Spec
**Date**: 2026-05-07  
**Status**: Approved  
**Approach**: Option A — DeerFlow as AI sidecar; Convex stays as data layer

---

## Problem

VEPIP's current AI layer (`/api/ai/chat`) is a single-turn intent classifier: one LLM call, no memory, no streaming, no multi-step reasoning. It cannot handle complex requests like "generate a quarterly report from all activities", cannot remember context from past sessions, and cannot proactively surface risks. The goal is to replace this with a full AI co-pilot that has memory, multi-step planning, streaming responses, and proactive intelligence — without rebuilding the platform.

---

## Architecture

```
┌─────────────────────────────────────┐
│  VEPIP (unchanged)                  │
│  Next.js + Convex                   │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │  AI Chat UI  │  │  Convex DB  │ │
│  │  (upgraded)  │  │  (schema    │ │
│  │  SSE stream  │  │  unchanged) │ │
│  └──────┬───────┘  └──────▲──────┘ │
│         │ SSE stream       │ HTTP   │
└─────────┼──────────────────┼────────┘
          │                  │ Convex HTTP Actions
          ▼                  │ (tool bridge)
┌─────────────────────────────────────┐
│  DeerFlow (new sidecar)             │
│  Python FastAPI + LangGraph         │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │  Lead Agent  │  │  Memory     │ │
│  │  + Convex    │  │  per-user   │ │
│  │  tools       │  │  JSON store │ │
│  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────┘
```

**Key principle**: Convex is the single source of truth for all structured domain data. DeerFlow is the intelligence layer. They communicate via Convex HTTP actions (DeerFlow calls Convex) and SSE streaming (VEPIP UI calls DeerFlow).

---

## Components

### 1. DeerFlow Setup

- Run DeerFlow backend only (no DeerFlow frontend — VEPIP's UI is used)
- LLM: Gemini 2.0 Flash (already in VEPIP's dependencies, familiar model)
- Transport: Docker container, exposed on port 8001
- Config: `deer-flow/config.yaml` with Gemini provider, memory enabled, subagents enabled
- `docker-compose.yml` at repo root starts both VEPIP (`npm run dev`) and DeerFlow
- No DeerFlow auth required in dev (no-auth mode); in production use DeerFlow's JWT auth

### 2. Convex HTTP Action Bridge

Seven new HTTP action endpoints added to `convex/http.ts`. All are POST, all require a shared `VEPIP_INTERNAL_SECRET` header. User identity is passed in the request body (`userId` field) and Convex enforces role-based access control using the existing `requireProjectAccess` pattern.

| Endpoint | Purpose |
|---|---|
| `POST /ai/project-context` | Full project snapshot: deliverables, budget, activities (last 30), milestones, alerts |
| `POST /ai/log-activity` | Create an activity record (same as `operations.logActivity` mutation) |
| `POST /ai/record-expense` | Record an expense (same as `operations.recordExpense` mutation) |
| `POST /ai/update-deliverable` | Update deliverable progress (achieved count) |
| `POST /ai/org-summary` | Org-wide: all active projects, total grant amounts, at-risk count, upcoming deliverables |
| `POST /ai/draft-report-data` | All data for a report period (activities, expenses, deliverables, milestones) |
| `POST /ai/write-alert` | Create a proactive alert record (severity: info/watch/critical) |

**Security**: The `VEPIP_INTERNAL_SECRET` env var is shared between VEPIP's Next.js env and DeerFlow's `config.yaml`. It is never exposed to the browser. All Convex HTTP actions check this header before processing.

### 3. DeerFlow Convex Tools (Python)

Located at `deer-flow/skills/custom/vepip/tools.py`. Seven Python functions, each wrapping one Convex HTTP action. Registered as LangChain tools with typed input schemas (Pydantic models).

```python
# Example shape
@tool
def get_project_context(project_id: str, user_id: str) -> dict:
    """Get full context for a VEPIP project including deliverables, budget, activities, milestones and alerts."""
    ...
```

Tools are loaded into DeerFlow's lead agent via the config's `tools[]` list.

### 4. VEPIP Domain Skill

`deer-flow/skills/custom/vepip/SKILL.md` — teaches the agent about VisionEmpower's domain:
- What projects, deliverables, funders, and activities mean in the NGO context
- How to interpret casual field reports ("visited 3 schools in Karnataka, trained 45 teachers")
- How to calculate impact metrics (teachers reached, students reached, budget utilization)
- Tone: professional but accessible, used by program managers in the field
- How to structure quarterly reports for funders

### 5. Chat Component Upgrade

**Current**: `src/app/(main)/_components/ai-chat.tsx` calls `POST /api/ai/chat`, waits for full JSON response, renders the intent/data confirm-cancel loop.

**Upgraded**:
- On first message, call `POST /api/ai/create-thread` → DeerFlow creates a thread, returns `threadId`
- Store `threadId` in localStorage keyed by `projectId` (so each project has a persistent conversation)
- Subsequent messages: call `POST /api/ai/stream` with `{ threadId, message, projectId, userId }` → returns SSE stream
- SSE handler renders streaming tokens in real-time
- Intent-based confirm/cancel loop is preserved for write operations (DeerFlow will emit structured tool-call events that the UI can intercept)
- `src/app/api/ai/` directory: `create-thread/route.ts`, `stream/route.ts` (proxies to DeerFlow with auth headers)

### 6. Proactive Intelligence

**Mechanism**: Convex cron job (weekly, Mondays 9am) in `convex/crons.ts` triggers a Next.js API route `POST /api/ai/analyze-projects`. This route calls DeerFlow's `POST /api/runs/wait` with a prompt: "Analyze all active VEPIP projects for risks, overdue items, and budget concerns. Write alerts for any critical findings."

DeerFlow's agent:
1. Calls `get_org_summary` tool → gets all active projects
2. For each at-risk project, calls `get_project_context` → gets full details
3. Identifies specific risks (overdue deliverables, budget overrun, milestone slip)
4. Calls `write_alert` tool for each finding

Alerts surface in VEPIP's existing alerts UI immediately via Convex reactivity.

### 7. Memory

DeerFlow's built-in per-user memory is enabled in `config.yaml`. The `userId` passed in every thread creation maps to DeerFlow's user isolation. Memory is stored at `deer-flow/backend/.deer-flow/users/{userId}/memory.json`.

Over time, the agent learns: which projects a user manages, their preferred reporting style, common field activity patterns, budget category names used in their projects.

---

## Data Flow: Typical Interaction

1. User types "we visited 3 schools in Mysore yesterday, trained 48 teachers and 200 students" in the project chat
2. VEPIP UI sends message to DeerFlow via SSE stream proxy
3. DeerFlow lead agent receives message + thread history + injected memory
4. Agent calls `get_project_context(projectId)` → understands deliverable names and budget categories
5. Agent plans: log_activity with parsed data, update_deliverable progress for "Teachers Trained" deliverable
6. Agent streams response tokens back to UI in real-time
7. UI renders "I'll log this activity and update your Teachers Trained deliverable from 234 to 282. Confirm?"
8. User confirms → UI calls Convex mutations directly (existing confirm/cancel pattern preserved)

---

## Data Flow: Report Generation

1. User types "generate Q3 report for Project X"
2. Agent calls `get_draft_report_data(projectId, "2025-10-01", "2025-12-31")`
3. Agent structures narrative using the VEPIP skill's report template
4. Streams the full draft report text back to the UI
5. User can copy/export to Word (VEPIP already has docx generation)

---

## Environment Variables

### VEPIP `.env.local`
```
VEPIP_INTERNAL_SECRET=<random 32-char hex>
DEERFLOW_BASE_URL=http://localhost:8001
```

### DeerFlow `config.yaml`
```yaml
models:
  - name: gemini-2.0-flash
    use: langchain_google_genai:ChatGoogleGenerativeAI
    model: gemini-2.0-flash
    api_key: $GOOGLE_AI_API_KEY

memory:
  enabled: true
  injection_enabled: true
```

### DeerFlow `.env`
```
GOOGLE_AI_API_KEY=<key>
VEPIP_CONVEX_HTTP_URL=<convex deployment HTTP URL>
VEPIP_INTERNAL_SECRET=<same secret as VEPIP>
```

---

## Implementation Phases

| Phase | Deliverable | Key files |
|---|---|---|
| 1 | DeerFlow running locally with Gemini | `docker-compose.yml`, `deer-flow/config.yaml`, `deer-flow/.env` |
| 2 | Convex HTTP action bridge | `convex/http.ts` (7 new actions) |
| 3 | DeerFlow Convex tools + VEPIP skill | `deer-flow/skills/custom/vepip/tools.py`, `SKILL.md` |
| 4 | Chat component upgrade to SSE streaming | `src/app/api/ai/`, `ai-chat.tsx` upgrade |
| 5 | Memory + thread persistence | `deer-flow/config.yaml` memory section, localStorage thread IDs |
| 6 | Proactive intelligence cron | `convex/crons.ts`, `src/app/api/ai/analyze-projects/route.ts` |

---

## What Does NOT Change

- Convex schema — zero changes
- RBAC / roles — zero changes
- All existing VEPIP pages, dashboards, CRM, finance, analytics
- Better-auth authentication flow
- Real-time reactivity (all Convex queries remain live)
- The confirm/cancel UX pattern for write operations

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| DeerFlow adds latency vs current single LLM call | SSE streaming hides latency — user sees tokens immediately |
| Convex HTTP actions expose write surface | `VEPIP_INTERNAL_SECRET` header + Convex-side access control checks |
| DeerFlow memory grows stale (wrong project data) | Memory stores user preferences/style, not project facts. Facts come from live Convex tool calls |
| Docker overhead in dev | DeerFlow backend only (no sandbox, no nginx) — lightweight in dev mode |
