# DeerFlow AI Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace VEPIP's single-turn AI chat with a full DeerFlow-powered co-pilot that has memory, multi-step planning, streaming, and proactive intelligence — without changing Convex schema or RBAC.

**Architecture:** DeerFlow backend (Python/FastAPI/LangGraph, port 8001) runs as a sidecar. VEPIP's Next.js calls it via a thin proxy. DeerFlow reads/writes Convex domain data through seven HTTP actions secured by a shared internal secret.

**Tech Stack:** DeerFlow 2.0 (LangGraph + FastAPI), langchain_google_genai (Gemini), httpx (Convex HTTP calls), Convex HTTP actions, Next.js 15 SSE streaming, React 19.

---

## File Map

**New files:**
- `deer-flow/config.yaml` — DeerFlow runtime config (Gemini model, memory, VEPIP tools, skill path)
- `deer-flow/.env` — DeerFlow env vars (GOOGLE_AI_API_KEY, VEPIP_CONVEX_SITE_URL, VEPIP_INTERNAL_SECRET)
- `deer-flow/backend/packages/harness/deerflow/community/vepip/__init__.py` — empty package marker
- `deer-flow/backend/packages/harness/deerflow/community/vepip/tools.py` — 7 LangChain tools wrapping Convex HTTP actions
- `deer-flow/skills/custom/vepip/SKILL.md` — domain skill teaching agent VisionEmpower context
- `src/app/api/ai/create-thread/route.ts` — proxy: POST → DeerFlow creates thread
- `src/app/api/ai/stream/route.ts` — proxy: POST → DeerFlow SSE run stream
- `src/app/api/ai/analyze-projects/route.ts` — called by cron to trigger proactive analysis

**Modified files:**
- `convex/http.ts` — add 7 internal HTTP action endpoints
- `src/app/(main)/_components/ai-chat.tsx` — upgrade to SSE streaming with thread persistence
- `convex/crons.ts` — add weekly proactive analysis trigger
- `.env.local` — add VEPIP_INTERNAL_SECRET and DEERFLOW_BASE_URL

---

## Task 1: Configure DeerFlow

**Files:**
- Create: `deer-flow/config.yaml`
- Create: `deer-flow/.env`

- [ ] **Step 1: Create DeerFlow config.yaml**

Create `deer-flow/config.yaml`:

```yaml
config_version: 8
log_level: info

token_usage:
  enabled: false

models:
  - name: gemini-2.0-flash
    display_name: Gemini 2.0 Flash
    use: langchain_google_genai:ChatGoogleGenerativeAI
    model: gemini-2.0-flash
    gemini_api_key: $GOOGLE_AI_API_KEY
    timeout: 120.0
    max_retries: 2
    max_tokens: 8192
    temperature: 0.5

tool_groups:
  - name: web
  - name: file:read
  - name: file:write
  - name: bash
  - name: vepip

tools:
  - name: get_project_context
    group: vepip
    use: deerflow.community.vepip.tools:get_project_context_tool

  - name: log_activity
    group: vepip
    use: deerflow.community.vepip.tools:log_activity_tool

  - name: record_expense
    group: vepip
    use: deerflow.community.vepip.tools:record_expense_tool

  - name: update_deliverable
    group: vepip
    use: deerflow.community.vepip.tools:update_deliverable_tool

  - name: add_milestone
    group: vepip
    use: deerflow.community.vepip.tools:add_milestone_tool

  - name: add_testimonial
    group: vepip
    use: deerflow.community.vepip.tools:add_testimonial_tool

  - name: get_org_summary
    group: vepip
    use: deerflow.community.vepip.tools:get_org_summary_tool

  - name: write_alert
    group: vepip
    use: deerflow.community.vepip.tools:write_alert_tool

  - name: get_report_data
    group: vepip
    use: deerflow.community.vepip.tools:get_report_data_tool

  - name: ls
    group: file:read
    use: deerflow.sandbox.tools:ls_tool

  - name: read_file
    group: file:read
    use: deerflow.sandbox.tools:read_file_tool

  - name: write_file
    group: file:write
    use: deerflow.sandbox.tools:write_file_tool

tool_search:
  enabled: false

uploads:
  max_files: 10
  max_file_size: 52428800
  max_total_size: 104857600
  auto_convert_documents: false

sandbox:
  use: deerflow.sandbox.local:LocalSandboxProvider
  allow_host_bash: false

memory:
  enabled: true
  injection_enabled: true
  debounce_seconds: 30
  max_facts: 100
  fact_confidence_threshold: 0.7
  max_injection_tokens: 2000

subagents:
  enabled: false

skills:
  path: skills
```

- [ ] **Step 2: Create deer-flow/.env**

Create `deer-flow/.env`:

```
GOOGLE_AI_API_KEY=AIzaSyDauHOfIsz5YWC7dXxbl6S2NPi-hGyW7qs
VEPIP_CONVEX_SITE_URL=https://kindly-spider-900.convex.site
VEPIP_INTERNAL_SECRET=vepip-deerflow-secret-2026
DEER_FLOW_CONFIG_PATH=../config.yaml
```

- [ ] **Step 3: Add VEPIP_INTERNAL_SECRET and DEERFLOW_BASE_URL to .env.local**

Open `.env.local` and append these two lines:

```
DEERFLOW_BASE_URL=http://localhost:8001
VEPIP_INTERNAL_SECRET=vepip-deerflow-secret-2026
```

- [ ] **Step 4: Start DeerFlow backend and verify it starts**

Open a second terminal. Run:

```powershell
cd "C:\Users\Chandrakiran H J\Pictures\VEPIP\deer-flow\backend"
uv sync
$env:DEER_FLOW_CONFIG_PATH = "..\config.yaml"
$env:GOOGLE_AI_API_KEY = "AIzaSyDauHOfIsz5YWC7dXxbl6S2NPi-hGyW7qs"
uv run python -m uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

Expected output:
```
INFO:     Started server process [...]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
```

- [ ] **Step 5: Verify health endpoint responds**

```powershell
Invoke-RestMethod -Uri "http://localhost:8001/health"
```

Expected: `{ "status": "ok" }` or similar 200 response.

- [ ] **Step 6: Commit**

```bash
git add deer-flow/config.yaml deer-flow/.env
git commit -m "feat: add DeerFlow config and env for VEPIP sidecar"
```

---

## Task 2: Convex HTTP Action Bridge

**Files:**
- Modify: `convex/http.ts`

These HTTP actions are called by DeerFlow's Python tools. They validate a shared secret header and perform Convex operations using the caller's email for identity.

- [ ] **Step 1: Replace convex/http.ts with the full HTTP bridge**

Replace the entire content of `convex/http.ts`:

```typescript
import { httpRouter, httpAction } from "convex/server";
import { v } from "convex/values";

import { authComponent, createAuth } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// ── Shared auth helper ────────────────────────────────────────────────────────

async function verifyInternalRequest(
  ctx: any,
  request: Request,
): Promise<{ person: Doc<"people">; body: any }> {
  const secret = process.env.VEPIP_INTERNAL_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const body = await request.json();
  const email = String(body.userEmail ?? "").trim().toLowerCase();
  if (!email) throw new Response("userEmail required", { status: 400 });

  const person = (await ctx.runQuery(
    (await import("./_generated/api")).internal.people.getByEmailInternal,
    { email },
  )) as Doc<"people"> | null;

  if (!person) throw new Response("User not found", { status: 404 });
  return { person, body };
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET /ai/project-context ───────────────────────────────────────────────────

http.route({
  path: "/ai/project-context",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { body } = await verifyInternalRequest(ctx, request);
      const projectId = body.projectId as Id<"projects">;
      const data = await ctx.runQuery(
        (await import("./_generated/api")).internal.projects.getContextInternal,
        { projectId },
      );
      return jsonOk(data);
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/log-activity ─────────────────────────────────────────────────────

http.route({
  path: "/ai/log-activity",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { person, body } = await verifyInternalRequest(ctx, request);
      const id = await ctx.runMutation(
        (await import("./_generated/api")).internal.operations.logActivityInternal,
        { ...body, personId: person._id },
      );
      return jsonOk({ id });
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/record-expense ───────────────────────────────────────────────────

http.route({
  path: "/ai/record-expense",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { person, body } = await verifyInternalRequest(ctx, request);
      const id = await ctx.runMutation(
        (await import("./_generated/api")).internal.operations.recordExpenseInternal,
        { ...body, personId: person._id },
      );
      return jsonOk({ id });
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/update-deliverable ───────────────────────────────────────────────

http.route({
  path: "/ai/update-deliverable",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { body } = await verifyInternalRequest(ctx, request);
      await ctx.runMutation(
        (await import("./_generated/api")).internal.operations.updateDeliverableInternal,
        { deliverableId: body.deliverableId as Id<"deliverables">, achieved: Number(body.achieved) },
      );
      return jsonOk({ ok: true });
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/add-milestone ────────────────────────────────────────────────────

http.route({
  path: "/ai/add-milestone",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { body } = await verifyInternalRequest(ctx, request);
      const id = await ctx.runMutation(
        (await import("./_generated/api")).internal.milestones.addInternal,
        {
          projectId: body.projectId as Id<"projects">,
          title: String(body.title),
          dueDate: String(body.dueDate),
        },
      );
      return jsonOk({ id });
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/add-testimonial ──────────────────────────────────────────────────

http.route({
  path: "/ai/add-testimonial",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { body } = await verifyInternalRequest(ctx, request);
      const id = await ctx.runMutation(
        (await import("./_generated/api")).internal.impact.addTestimonialInternal,
        {
          projectId: body.projectId as Id<"projects">,
          content: String(body.content),
          author: String(body.author),
          role: body.role ? String(body.role) : undefined,
        },
      );
      return jsonOk({ id });
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/org-summary ──────────────────────────────────────────────────────

http.route({
  path: "/ai/org-summary",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      await verifyInternalRequest(ctx, request);
      const data = await ctx.runQuery(
        (await import("./_generated/api")).internal.projects.getOrgSummaryInternal,
        {},
      );
      return jsonOk(data);
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/write-alert ──────────────────────────────────────────────────────

http.route({
  path: "/ai/write-alert",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { body } = await verifyInternalRequest(ctx, request);
      const id = await ctx.runMutation(
        (await import("./_generated/api")).internal.alertsInternal.writeAlertInternal,
        {
          projectId: body.projectId as Id<"projects">,
          title: String(body.title),
          severity: body.severity as "info" | "watch" | "critical",
        },
      );
      return jsonOk({ id });
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/report-data ──────────────────────────────────────────────────────

http.route({
  path: "/ai/report-data",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { body } = await verifyInternalRequest(ctx, request);
      const data = await ctx.runQuery(
        (await import("./_generated/api")).internal.projects.getReportDataInternal,
        {
          projectId: body.projectId as Id<"projects">,
          periodStart: String(body.periodStart),
          periodEnd: String(body.periodEnd),
        },
      );
      return jsonOk(data);
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

export default http;
```

- [ ] **Step 2: Add internal people query to convex/people.ts**

Open `convex/people.ts` and add this at the bottom:

```typescript
export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", email)).unique();
  },
});
```

Also add `internalQuery` to the import at the top — change:
```typescript
import { mutation, query } from "./_generated/server";
```
to:
```typescript
import { internalQuery, mutation, query } from "./_generated/server";
```

- [ ] **Step 3: Add internal project queries to convex/projects.ts**

Open `convex/projects.ts`. Add at the bottom:

```typescript
export const getContextInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const [deliverables, budgets, activities, milestones, alerts, reports] = await Promise.all([
      ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("budgetCategories").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", project._id)).order("desc").take(30),
      ctx.db.query("milestones").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("alerts").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("reports").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
    ]);
    return {
      id: project._id,
      name: project.name,
      funderName: project.funderName,
      status: project.status,
      grantAmount: project.grantAmount,
      startDate: project.startDate,
      endDate: project.endDate,
      states: project.states,
      summary: project.summary,
      deliverables: deliverables.map((d) => ({ id: d._id, title: d.title, target: d.target, achieved: d.achieved, unit: d.unit, dueDate: d.dueDate, status: d.status })),
      budgetCategories: budgets.map((b) => ({ id: b._id, name: b.name, approvedAmount: b.approvedAmount, spentAmount: b.spentAmount })),
      recentActivities: activities.map((a) => ({ id: a._id, title: a.title, activityDate: a.activityDate, state: a.state, location: a.location, teachersReached: a.teachersReached, studentsReached: a.studentsReached, schoolsReached: a.schoolsReached })),
      milestones: milestones.map((m) => ({ id: m._id, title: m.title, dueDate: m.dueDate, status: m.status })),
      unresolvedAlerts: alerts.filter((a) => !a.resolvedAt).map((a) => ({ id: a._id, title: a.title, severity: a.severity })),
      reports: reports.map((r) => ({ id: r._id, periodStart: r.periodStart, periodEnd: r.periodEnd, dueDate: r.dueDate, status: r.status, title: r.title })),
    };
  },
});

export const getOrgSummaryInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    const active = projects.filter((p) => p.status !== "completed");
    return {
      totalProjects: projects.length,
      activeProjects: active.length,
      atRisk: active.filter((p) => p.status === "at_risk" || p.status === "overdue").length,
      totalGrantAmount: active.reduce((sum, p) => sum + p.grantAmount, 0),
      projects: active.map((p) => ({
        id: p._id,
        name: p.name,
        funderName: p.funderName,
        status: p.status,
        endDate: p.endDate,
        grantAmount: p.grantAmount,
      })),
    };
  },
});

export const getReportDataInternal = internalQuery({
  args: { projectId: v.id("projects"), periodStart: v.string(), periodEnd: v.string() },
  handler: async (ctx, { projectId, periodStart, periodEnd }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const [activities, expenses, deliverables, milestones] = await Promise.all([
      ctx.db.query("activities").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("expenses").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("deliverables").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("milestones").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
    ]);
    return {
      project: { name: project.name, funderName: project.funderName, grantAmount: project.grantAmount },
      periodStart,
      periodEnd,
      activities: activities.filter((a) => a.activityDate >= periodStart && a.activityDate <= periodEnd),
      expenses: expenses.filter((e) => e.spentOn >= periodStart && e.spentOn <= periodEnd),
      deliverables,
      milestones: milestones.filter((m) => m.dueDate >= periodStart && m.dueDate <= periodEnd),
    };
  },
});
```

Add `internalQuery` to the import at the top of `convex/projects.ts`:
```typescript
import { internalQuery, mutation, query } from "./_generated/server";
```

- [ ] **Step 4: Add internal mutations to convex/operations.ts**

Open `convex/operations.ts`. Add at the bottom:

```typescript
export const logActivityInternal = internalMutation({
  args: {
    personId: v.id("people"),
    projectId: v.id("projects"),
    title: v.string(),
    activityDate: v.string(),
    state: v.optional(v.string()),
    location: v.optional(v.string()),
    teachersReached: v.optional(v.number()),
    studentsReached: v.optional(v.number()),
    schoolsReached: v.optional(v.number()),
    notes: v.optional(v.string()),
    testimonial: v.optional(v.string()),
    testimonialBy: v.optional(v.string()),
  },
  handler: async (ctx, { personId, ...args }) => {
    return ctx.db.insert("activities", args);
  },
});

export const recordExpenseInternal = internalMutation({
  args: {
    personId: v.id("people"),
    projectId: v.id("projects"),
    categoryId: v.id("budgetCategories"),
    spentOn: v.string(),
    amount: v.number(),
    description: v.string(),
    paymentMode: v.optional(v.string()),
  },
  handler: async (ctx, { personId, ...args }) => {
    const expenseId = await ctx.db.insert("expenses", { ...args, status: "submitted" });
    const category = await ctx.db.get(args.categoryId);
    if (category) {
      await ctx.db.patch(args.categoryId, { spentAmount: category.spentAmount + args.amount });
    }
    return expenseId;
  },
});

export const updateDeliverableInternal = internalMutation({
  args: { deliverableId: v.id("deliverables"), achieved: v.number() },
  handler: async (ctx, { deliverableId, achieved }) => {
    await ctx.db.patch(deliverableId, { achieved });
  },
});
```

Add `internalMutation` to the import at the top of `convex/operations.ts`:
```typescript
import { internalMutation, mutation, query } from "./_generated/server";
```

- [ ] **Step 5: Add internal mutation to convex/milestones.ts**

Open `convex/milestones.ts`. Add at the bottom:

```typescript
export const addInternal = internalMutation({
  args: { projectId: v.id("projects"), title: v.string(), dueDate: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("milestones", { ...args, status: "not_started" });
  },
});
```

Add `internalMutation` to the import at the top of `convex/milestones.ts`.

- [ ] **Step 6: Add internal mutation to convex/impact.ts**

Open `convex/impact.ts`. Add at the bottom:

```typescript
export const addTestimonialInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    author: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("testimonials", { ...args, createdAt: Date.now() });
  },
});
```

Add `internalMutation` to the import at the top of `convex/impact.ts`:
```typescript
import { internalMutation, mutation, query } from "./_generated/server";
```

- [ ] **Step 7: Add internal mutation to convex/alertsInternal.ts**

Open `convex/alertsInternal.ts`. Add at the bottom:

```typescript
export const writeAlertInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    severity: v.union(v.literal("info"), v.literal("watch"), v.literal("critical")),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("alerts", { ...args, createdAt: Date.now() });
  },
});
```

- [ ] **Step 8: Add VEPIP_INTERNAL_SECRET to Convex dashboard**

Run `npx convex env set VEPIP_INTERNAL_SECRET vepip-deerflow-secret-2026` in your terminal (VEPIP project root).

- [ ] **Step 9: Verify Convex generates types without errors**

Run: `npx convex dev`

Expected: no TypeScript errors, `convex/_generated/` updates.

- [ ] **Step 10: Test one HTTP action endpoint**

With `npx convex dev` running, test:

```powershell
Invoke-RestMethod -Uri "https://kindly-spider-900.convex.site/ai/org-summary" `
  -Method POST `
  -Headers @{ Authorization = "Bearer vepip-deerflow-secret-2026"; "Content-Type" = "application/json" } `
  -Body '{"userEmail":"chandrakiran@visionempowertrust.org"}'
```

Expected: JSON with `totalProjects`, `activeProjects`, etc.

- [ ] **Step 11: Commit**

```bash
git add convex/http.ts convex/people.ts convex/projects.ts convex/operations.ts convex/milestones.ts convex/impact.ts convex/alertsInternal.ts
git commit -m "feat: add Convex HTTP action bridge for DeerFlow tools"
```

---

## Task 3: DeerFlow VEPIP Python Tools

**Files:**
- Create: `deer-flow/backend/packages/harness/deerflow/community/vepip/__init__.py`
- Create: `deer-flow/backend/packages/harness/deerflow/community/vepip/tools.py`

- [ ] **Step 1: Create the __init__.py**

Create `deer-flow/backend/packages/harness/deerflow/community/vepip/__init__.py` with empty content:

```python
```

- [ ] **Step 2: Create tools.py**

Create `deer-flow/backend/packages/harness/deerflow/community/vepip/tools.py`:

```python
import json
import os

import httpx
from langchain.tools import tool

_CONVEX_SITE_URL = os.environ.get("VEPIP_CONVEX_SITE_URL", "")
_INTERNAL_SECRET = os.environ.get("VEPIP_INTERNAL_SECRET", "")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_INTERNAL_SECRET}",
        "Content-Type": "application/json",
    }


def _post(path: str, payload: dict) -> dict:
    url = f"{_CONVEX_SITE_URL}{path}"
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, json=payload, headers=_headers())
        resp.raise_for_status()
        return resp.json()


@tool("get_project_context", parse_docstring=True)
def get_project_context_tool(project_id: str, user_email: str) -> str:
    """Get full context for a VEPIP project: deliverables, budget categories, recent activities, milestones, and alerts.
    Always call this first when the user mentions a specific project.

    Args:
        project_id: The Convex ID of the project (e.g. 'j97abc123def').
        user_email: The email address of the requesting user.
    """
    data = _post("/ai/project-context", {"projectId": project_id, "userEmail": user_email})
    return json.dumps(data, indent=2)


@tool("log_activity", parse_docstring=True)
def log_activity_tool(
    project_id: str,
    user_email: str,
    title: str,
    activity_date: str,
    state: str = "",
    location: str = "",
    teachers_reached: int = 0,
    students_reached: int = 0,
    schools_reached: int = 0,
    notes: str = "",
    testimonial: str = "",
    testimonial_by: str = "",
) -> str:
    """Log a field activity for a VEPIP project. Only call this AFTER the user has confirmed the details.

    Args:
        project_id: The Convex ID of the project.
        user_email: The email address of the requesting user.
        title: Short descriptive title of the activity (e.g. 'Teacher training workshop in Mysore').
        activity_date: Date in YYYY-MM-DD format.
        state: Indian state name where the activity happened.
        location: Specific location or district.
        teachers_reached: Number of teachers reached (0 if not mentioned).
        students_reached: Number of students reached (0 if not mentioned).
        schools_reached: Number of schools reached (0 if not mentioned).
        notes: Any additional notes or observations.
        testimonial: A quote or testimonial from a beneficiary or participant.
        testimonial_by: Name of the person who gave the testimonial.
    """
    payload = {
        "projectId": project_id,
        "userEmail": user_email,
        "title": title,
        "activityDate": activity_date,
    }
    if state:
        payload["state"] = state
    if location:
        payload["location"] = location
    if teachers_reached:
        payload["teachersReached"] = teachers_reached
    if students_reached:
        payload["studentsReached"] = students_reached
    if schools_reached:
        payload["schoolsReached"] = schools_reached
    if notes:
        payload["notes"] = notes
    if testimonial:
        payload["testimonial"] = testimonial
    if testimonial_by:
        payload["testimonialBy"] = testimonial_by
    result = _post("/ai/log-activity", payload)
    return f"Activity logged successfully. ID: {result.get('id', 'unknown')}"


@tool("record_expense", parse_docstring=True)
def record_expense_tool(
    project_id: str,
    user_email: str,
    category_id: str,
    amount: float,
    description: str,
    spent_on: str,
    payment_mode: str = "",
) -> str:
    """Record an expense for a VEPIP project. Only call AFTER user confirms. Get category IDs from get_project_context first.

    Args:
        project_id: The Convex ID of the project.
        user_email: The email address of the requesting user.
        category_id: The Convex ID of the budget category (get from get_project_context).
        amount: The amount spent in rupees.
        description: Description of what was spent on.
        spent_on: Date in YYYY-MM-DD format.
        payment_mode: Payment method (cash, UPI, cheque, etc.).
    """
    payload = {
        "projectId": project_id,
        "userEmail": user_email,
        "categoryId": category_id,
        "amount": amount,
        "description": description,
        "spentOn": spent_on,
    }
    if payment_mode:
        payload["paymentMode"] = payment_mode
    result = _post("/ai/record-expense", payload)
    return f"Expense of ₹{amount} recorded. ID: {result.get('id', 'unknown')}"


@tool("update_deliverable", parse_docstring=True)
def update_deliverable_tool(
    user_email: str,
    deliverable_id: str,
    achieved: int,
) -> str:
    """Update the achieved count for a project deliverable. Only call AFTER user confirms. Get deliverable IDs from get_project_context.

    Args:
        user_email: The email address of the requesting user.
        deliverable_id: The Convex ID of the deliverable.
        achieved: The new total achieved count (not a delta — set the absolute total).
    """
    _post("/ai/update-deliverable", {"userEmail": user_email, "deliverableId": deliverable_id, "achieved": achieved})
    return f"Deliverable updated to {achieved} achieved."


@tool("add_milestone", parse_docstring=True)
def add_milestone_tool(
    user_email: str,
    project_id: str,
    title: str,
    due_date: str,
) -> str:
    """Add a new milestone to a project. Only call AFTER user confirms.

    Args:
        user_email: The email address of the requesting user.
        project_id: The Convex ID of the project.
        title: Title of the milestone.
        due_date: Due date in YYYY-MM-DD format.
    """
    result = _post("/ai/add-milestone", {"userEmail": user_email, "projectId": project_id, "title": title, "dueDate": due_date})
    return f"Milestone '{title}' added. ID: {result.get('id', 'unknown')}"


@tool("add_testimonial", parse_docstring=True)
def add_testimonial_tool(
    user_email: str,
    project_id: str,
    content: str,
    author: str,
    role: str = "",
) -> str:
    """Record an impact testimonial for a project. Only call AFTER user confirms.

    Args:
        user_email: The email address of the requesting user.
        project_id: The Convex ID of the project.
        content: The testimonial quote or story.
        author: Name of the person who gave the testimonial.
        role: Their role (e.g. 'Teacher', 'Parent', 'Student').
    """
    payload = {"userEmail": user_email, "projectId": project_id, "content": content, "author": author}
    if role:
        payload["role"] = role
    result = _post("/ai/add-testimonial", payload)
    return f"Testimonial from {author} recorded. ID: {result.get('id', 'unknown')}"


@tool("get_org_summary", parse_docstring=True)
def get_org_summary_tool(user_email: str) -> str:
    """Get organisation-wide summary: all active projects, total grant amount, at-risk count. Use for leadership/analytics questions.

    Args:
        user_email: The email address of the requesting user.
    """
    data = _post("/ai/org-summary", {"userEmail": user_email})
    return json.dumps(data, indent=2)


@tool("write_alert", parse_docstring=True)
def write_alert_tool(
    user_email: str,
    project_id: str,
    title: str,
    severity: str,
) -> str:
    """Create a proactive alert for a project. Use when you identify a risk during analysis.

    Args:
        user_email: The email address of the requesting user.
        project_id: The Convex ID of the project.
        title: Clear description of the alert (e.g. 'Budget for Travel >90% spent with 3 months remaining').
        severity: One of 'info', 'watch', or 'critical'.
    """
    result = _post("/ai/write-alert", {"userEmail": user_email, "projectId": project_id, "title": title, "severity": severity})
    return f"Alert created. ID: {result.get('id', 'unknown')}"


@tool("get_report_data", parse_docstring=True)
def get_report_data_tool(
    user_email: str,
    project_id: str,
    period_start: str,
    period_end: str,
) -> str:
    """Get all data needed to write a funder report: activities, expenses, deliverables, milestones for a period.

    Args:
        user_email: The email address of the requesting user.
        project_id: The Convex ID of the project.
        period_start: Start date in YYYY-MM-DD format.
        period_end: End date in YYYY-MM-DD format.
    """
    data = _post("/ai/report-data", {"userEmail": user_email, "projectId": project_id, "periodStart": period_start, "periodEnd": period_end})
    return json.dumps(data, indent=2)
```

- [ ] **Step 3: Restart DeerFlow and verify tools load**

Stop DeerFlow (Ctrl+C in its terminal). Restart:

```powershell
cd "C:\Users\Chandrakiran H J\Pictures\VEPIP\deer-flow\backend"
$env:DEER_FLOW_CONFIG_PATH = "..\config.yaml"
$env:GOOGLE_AI_API_KEY = "AIzaSyDauHOfIsz5YWC7dXxbl6S2NPi-hGyW7qs"
$env:VEPIP_CONVEX_SITE_URL = "https://kindly-spider-900.convex.site"
$env:VEPIP_INTERNAL_SECRET = "vepip-deerflow-secret-2026"
uv run python -m uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload
```

Expected: starts without `ImportError`. Check the log for any tool loading errors.

- [ ] **Step 4: Verify tools appear in DeerFlow models endpoint**

```powershell
Invoke-RestMethod -Uri "http://localhost:8001/api/models"
```

Expected: JSON list of models including `gemini-2.0-flash`.

- [ ] **Step 5: Commit**

```bash
git add "deer-flow/backend/packages/harness/deerflow/community/vepip/"
git commit -m "feat: add DeerFlow VEPIP Python tools for Convex bridge"
```

---

## Task 4: VEPIP Domain Skill

**Files:**
- Create: `deer-flow/skills/custom/vepip/SKILL.md`

- [ ] **Step 1: Create the skills directory and SKILL.md**

```powershell
New-Item -ItemType Directory -Path "C:\Users\Chandrakiran H J\Pictures\VEPIP\deer-flow\skills\custom\vepip" -Force
```

Create `deer-flow/skills/custom/vepip/SKILL.md`:

```markdown
---
name: vepip-domain
description: VisionEmpower Project Intelligence Platform — domain knowledge for NGO project management
license: private
---

# VEPIP Project Intelligence Assistant

You are an AI co-pilot embedded in Vision Empower's internal Project Intelligence Platform. Vision Empower is a nonprofit organisation in India that provides inclusive education for visually impaired children. You help program managers, field staff, account managers, and leadership manage grant-funded projects.

## Your Role

You are a warm, professional assistant. You help with:
- Logging field activities from natural-language descriptions
- Recording expenses
- Updating deliverable progress
- Adding milestones and testimonials
- Answering questions about projects using live data
- Generating funder reports from project data
- Identifying risks and anomalies across the portfolio

## Domain Knowledge

**Projects**: Each project is a grant from a funder (e.g. Wipro Foundation, CSR funds). Projects have a grant amount, start/end dates, states they operate in, and a team (program manager + account manager).

**Deliverables**: Measurable targets the project must hit (e.g. "450 Teachers Trained", "20,000 Students Reached"). Each has a target count, achieved count, unit, and due date.

**Activities**: Field visits, workshops, training sessions. Logged with date, state, location, and impact numbers (teachers/students/schools reached).

**Budget categories**: e.g. Travel, Materials, Staff, Training. Each has an approved amount and a spent amount.

**Milestones**: Key project events (e.g. "Mid-term review completed", "State rollout launched").

**Reports**: Periodic funder reports (quarterly or full-term). Status: draft → submitted → approved.

**Alerts**: Flags for issues — overdue deliverables, budget overruns, inactivity, upcoming report deadlines.

## Workflow Rules

1. **Always get context first**: When a user mentions a project, call `get_project_context` to get live data before answering or acting. You need deliverable IDs, budget category IDs, etc.

2. **Always confirm before writing**: For any write operation (log_activity, record_expense, update_deliverable, add_milestone, add_testimonial), always describe exactly what you plan to record and ask "Should I go ahead and save this?" before calling the tool.

3. **Parse field descriptions carefully**: Field staff describe activities in casual language. Example: "we visited 3 schools in Mysore yesterday, trained 48 teachers and 200 students" → title="School visit and teacher training, Mysore", state="Karnataka", location="Mysore", schools_reached=3, teachers_reached=48, students_reached=200, activity_date=yesterday's date.

4. **Match deliverables intelligently**: When updating deliverable progress, find the closest matching deliverable by title. If the user says "we trained 48 more teachers", find the "Teachers Trained" deliverable and update achieved to current_achieved + 48.

5. **For report generation**: Use `get_report_data` to fetch all activities and expenses for the period. Structure the report with: Executive Summary, Activities Summary (with totals), Impact Metrics, Budget Utilisation, Milestones, Challenges, and Next Steps. Write in formal English suitable for a corporate/foundation funder.

6. **For leadership / org questions**: Use `get_org_summary` when the user asks about the portfolio, overall progress, or multiple projects.

## Common Indian States

Karnataka, Andhra Pradesh, Telangana, Tamil Nadu, Maharashtra, Gujarat, Rajasthan, Uttar Pradesh, Bihar, Odisha, Madhya Pradesh, West Bengal, Assam, Kerala, Jharkhand, Chhattisgarh.

## Tone

- Warm and supportive with field staff
- Professional and precise with leadership
- Always acknowledge the impactful work being done
- Use ₹ for currency amounts
```

- [ ] **Step 2: Verify skill loads on DeerFlow restart**

Restart DeerFlow (same command as Task 3 Step 3). Check logs for:
```
INFO: Loaded skill: vepip-domain
```
or similar skill loading message.

- [ ] **Step 3: Commit**

```bash
git add "deer-flow/skills/custom/vepip/SKILL.md"
git commit -m "feat: add VEPIP domain skill for DeerFlow agent"
```

---

## Task 5: Next.js Proxy API Routes

**Files:**
- Create: `src/app/api/ai/create-thread/route.ts`
- Create: `src/app/api/ai/stream/route.ts`
- Create: `src/app/api/ai/analyze-projects/route.ts`

- [ ] **Step 1: Create create-thread route**

Create `src/app/api/ai/create-thread/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function POST() {
  const deerflowUrl = process.env.DEERFLOW_BASE_URL ?? "http://localhost:8001";

  try {
    const res = await fetch(`${deerflowUrl}/api/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const thread = await res.json() as { thread_id: string };
    return NextResponse.json({ threadId: thread.thread_id });
  } catch (err) {
    console.error("[create-thread] Error:", err);
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create stream route**

Create `src/app/api/ai/stream/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const deerflowUrl = process.env.DEERFLOW_BASE_URL ?? "http://localhost:8001";

  try {
    const body = await request.json() as {
      threadId: string;
      message: string;
      projectId?: string;
      projectName?: string;
      userEmail: string;
      today: string;
    };

    const { threadId, message, projectId, projectName, userEmail, today } = body;

    if (!threadId || !message || !userEmail) {
      return NextResponse.json({ error: "threadId, message, and userEmail are required" }, { status: 400 });
    }

    // Embed context into the message so the agent knows which project/user to act on
    const contextBlock = [
      `<context>`,
      projectId ? `project_id: ${projectId}` : null,
      projectName ? `project_name: ${projectName}` : null,
      `user_email: ${userEmail}`,
      `today: ${today}`,
      `</context>`,
    ]
      .filter(Boolean)
      .join("\n");

    const fullMessage = `${contextBlock}\n\n${message}`;

    const deerflowRes = await fetch(
      `${deerflowUrl}/api/threads/${threadId}/runs/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            messages: [{ role: "user", content: fullMessage }],
          },
          config: {
            configurable: { model_name: "gemini-2.0-flash" },
          },
          stream_mode: ["messages"],
        }),
      },
    );

    if (!deerflowRes.ok || !deerflowRes.body) {
      const text = await deerflowRes.text();
      return NextResponse.json({ error: text }, { status: deerflowRes.status });
    }

    // Pipe the SSE stream directly to the client
    return new Response(deerflowRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[stream] Error:", err);
    return NextResponse.json({ error: "Failed to stream response" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create analyze-projects route**

Create `src/app/api/ai/analyze-projects/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Verify this is called from our own Convex cron via internal secret
  const secret = request.headers.get("x-internal-secret");
  if (secret !== process.env.VEPIP_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deerflowUrl = process.env.DEERFLOW_BASE_URL ?? "http://localhost:8001";
  const adminEmail = process.env.VEPIP_ADMIN_EMAIL ?? "chandrakiran@visionempowertrust.org";

  try {
    // Create a fresh thread for this analysis run
    const threadRes = await fetch(`${deerflowUrl}/api/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      return NextResponse.json({ error: "Failed to create analysis thread" }, { status: 500 });
    }

    const { thread_id } = await threadRes.json() as { thread_id: string };

    const today = new Date().toISOString().slice(0, 10);
    const analysisPrompt = `<context>
user_email: ${adminEmail}
today: ${today}
</context>

You are performing a weekly proactive project health check for Vision Empower.

1. Call get_org_summary to see all active projects.
2. For each project with status 'at_risk' or 'overdue', call get_project_context to understand specific issues.
3. For each significant risk you identify (budget overrun, stalled deliverables, upcoming deadlines), call write_alert with an appropriate severity (info/watch/critical) and a clear, actionable title.
4. When done, summarize what you found and what alerts you created.

Do not ask for confirmation — this is an automated analysis run. Execute fully.`;

    // Fire-and-forget: use /runs/wait so we get completion
    const runRes = await fetch(
      `${deerflowUrl}/api/threads/${thread_id}/runs/wait`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            messages: [{ role: "user", content: analysisPrompt }],
          },
          config: {
            configurable: { model_name: "gemini-2.0-flash" },
          },
        }),
      },
    );

    if (!runRes.ok) {
      const text = await runRes.text();
      console.error("[analyze-projects] Run failed:", text);
      return NextResponse.json({ error: "Analysis run failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, threadId: thread_id });
  } catch (err) {
    console.error("[analyze-projects] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Add VEPIP_ADMIN_EMAIL to .env.local**

Open `.env.local` and append:

```
VEPIP_ADMIN_EMAIL=chandrakiran@visionempowertrust.org
```

- [ ] **Step 5: Test create-thread endpoint**

With both VEPIP dev server and DeerFlow running:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/ai/create-thread" -Method POST
```

Expected: `{ "threadId": "some-uuid-string" }`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/create-thread/route.ts src/app/api/ai/stream/route.ts src/app/api/ai/analyze-projects/route.ts
git commit -m "feat: add Next.js proxy routes for DeerFlow thread creation and SSE streaming"
```

---

## Task 6: Upgrade AI Chat Component to SSE Streaming

**Files:**
- Modify: `src/app/(main)/_components/ai-chat.tsx`

The new component:
- Creates/persists a DeerFlow thread ID in localStorage per project
- Sends messages to the stream proxy and renders tokens as they arrive
- Uses conversational confirmation (user types "yes") instead of UI buttons
- Keeps the same visual layout (floating button, card panel)

- [ ] **Step 1: Replace ai-chat.tsx completely**

Replace the entire content of `src/app/(main)/_components/ai-chat.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface ChatProps {
  projectId?: Id<"projects">;
  projectName?: string;
  userEmail?: string;
}

function getThreadStorageKey(projectId: string) {
  return `vepip-thread-${projectId}`;
}

export function AiChat({ projectId, projectName, userEmail }: ChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: projectId
        ? `Hi! I'm your project assistant for **${projectName ?? "this project"}**. Describe what happened in the field and I'll log it for you, update deliverables, record expenses, or help you draft reports.`
        : "Hi! I'm your Project Intelligence assistant. Open a project first to start logging activities and data.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create or restore thread when projectId changes
  useEffect(() => {
    if (!projectId) return;
    const key = getThreadStorageKey(projectId);
    const stored = localStorage.getItem(key);
    if (stored) {
      setThreadId(stored);
      return;
    }
    fetch("/api/ai/create-thread", { method: "POST" })
      .then((r) => r.json())
      .then((data: { threadId?: string }) => {
        if (data.threadId) {
          localStorage.setItem(key, data.threadId);
          setThreadId(data.threadId);
        }
      })
      .catch((err) => console.error("[AiChat] thread creation failed", err));
  }, [projectId]);

  function addMessage(msg: Omit<Message, "id">) {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }

  function updateMessage(id: string, update: Partial<Message>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...update } : m)));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy || !threadId || !projectId) return;

    setInput("");
    setBusy(true);
    addMessage({ role: "user", content: text });
    const assistantId = addMessage({ role: "assistant", content: "", streaming: true });

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          threadId,
          message: text,
          projectId,
          projectName,
          userEmail: userEmail ?? "",
          today: new Date().toISOString().slice(0, 10),
        }),
      });

      if (!res.ok || !res.body) {
        updateMessage(assistantId, { content: "Sorry, something went wrong. Please try again.", streaming: false });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const accumulatedChunks: Record<string, string> = {};
      let currentAssistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === "null") continue;

          try {
            const parsed = JSON.parse(dataStr);
            // LangGraph messages stream: [[null, message_chunk], ...]  or  [message_chunk, metadata]
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of items) {
              // item could be [null, chunk] or just the chunk
              const chunk = Array.isArray(item) ? item[1] : item;
              if (!chunk || typeof chunk !== "object") continue;
              if (chunk.type === "AIMessageChunk" && chunk.content) {
                const msgId = chunk.id ?? "default";
                accumulatedChunks[msgId] = (accumulatedChunks[msgId] ?? "") + chunk.content;
                // Display the latest accumulated text across all message IDs
                currentAssistantText = Object.values(accumulatedChunks).join("");
                updateMessage(assistantId, { content: currentAssistantText, streaming: true });
              }
            }
          } catch {
            // non-JSON lines (e.g. event: metadata) — skip
          }
        }
      }

      updateMessage(assistantId, { streaming: false });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        updateMessage(assistantId, { content: "(Stopped)", streaming: false });
      } else {
        updateMessage(assistantId, { content: "Sorry, something went wrong. Please try again.", streaming: false });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleReset() {
    if (!projectId) return;
    localStorage.removeItem(getThreadStorageKey(projectId));
    setThreadId(null);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Started a new conversation for **${projectName ?? "this project"}**.`,
      },
    ]);
    // Re-trigger thread creation
    fetch("/api/ai/create-thread", { method: "POST" })
      .then((r) => r.json())
      .then((data: { threadId?: string }) => {
        if (data.threadId && projectId) {
          localStorage.setItem(getThreadStorageKey(projectId), data.threadId);
          setThreadId(data.threadId);
        }
      });
  }

  const canSend = Boolean(input.trim() && !busy && threadId && projectId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all",
          "bg-primary text-primary-foreground hover:scale-105 active:scale-95",
        )}
      >
        {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Project Intelligence Assistant</div>
              <div className="text-xs text-muted-foreground truncate">
                {projectName ? `Reviewing: ${projectName}` : "Select a project to start"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
              title="Start new conversation"
            >
              New chat
            </button>
          </div>

          {/* Messages */}
          <div className="flex flex-col gap-4 overflow-y-auto p-4 h-[450px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1",
                  msg.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-foreground",
                  )}
                >
                  {msg.content || (msg.streaming ? <Loader2 className="size-3 animate-spin" /> : "")}
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t p-3 bg-muted/20">
            <Input
              placeholder={projectId ? "What happened today?" : "Open a project to start…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!projectId}
              className="h-9 text-sm bg-background"
            />
            {busy ? (
              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 shrink-0" onClick={handleStop}>
                <X className="size-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-9 w-9 p-0 shrink-0"
                onClick={handleSend}
                disabled={!canSend}
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>

          {!projectId && (
            <div className="bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 text-center">
              Navigate to a project page to enable the assistant.
            </div>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Update AiChat usage to pass userEmail**

Find where `<AiChat>` is rendered in the codebase:

```bash
grep -r "AiChat" src/ --include="*.tsx" -l
```

In each file that renders `<AiChat>`, add a `userEmail` prop. The email comes from Convex auth. For example, if in a project page or layout, import the user session and pass `userEmail={session?.user?.email}`.

The typical usage in a project page will look like:
```tsx
// In src/app/(main)/projects/[projectId]/page.tsx or similar
<AiChat
  projectId={projectId}
  projectName={project?.name}
  userEmail={currentUser?.email}
/>
```

Find the current usages and add `userEmail` accordingly. The `userEmail` can also be sourced from a Convex query for the current person:
```tsx
const me = useQuery(api.people.getMe);  // if this query exists
// then pass: userEmail={me?.email}
```

If no `getMe` query exists, add this to `convex/people.ts`:
```typescript
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    if (!authUser?.email) return null;
    return ctx.db.query("people").withIndex("by_email", (q) => q.eq("email", authUser.email!.toLowerCase())).unique();
  },
});
```

- [ ] **Step 3: Verify the chat works end-to-end**

1. Start VEPIP: `npm run dev`
2. Start DeerFlow: (as in Task 3 Step 3)
3. Open a project page in the browser
4. Click the sparkles button
5. Type: "what's the status of this project?"
6. Verify: tokens stream in real-time, the agent calls `get_project_context` internally, and responds with actual project data
7. Type: "we visited 2 schools in Bangalore on Tuesday, trained 30 teachers"
8. Verify: agent describes what it plans to log and asks for confirmation
9. Type: "yes"
10. Verify: agent calls `log_activity` and confirms it saved

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/_components/ai-chat.tsx convex/people.ts
git commit -m "feat: upgrade AI chat to DeerFlow SSE streaming with thread persistence"
```

---

## Task 7: Proactive Intelligence Cron

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Add weekly proactive analysis cron**

Open `convex/crons.ts`. Replace the content:

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily-health-checks",
  { hourUTC: 1, minuteUTC: 0 },
  internal.alertsInternal.runDailyChecks,
);

crons.weekly(
  "weekly-ai-analysis",
  { dayOfWeek: "monday", hourUTC: 3, minuteUTC: 30 },
  internal.aiAnalysis.triggerWeeklyAnalysis,
);

export default crons;
```

- [ ] **Step 2: Create convex/aiAnalysis.ts**

Create `convex/aiAnalysis.ts`:

```typescript
import { internalAction } from "./_generated/server";

export const triggerWeeklyAnalysis = internalAction({
  args: {},
  handler: async () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const secret = process.env.VEPIP_INTERNAL_SECRET;

    if (!secret) {
      console.error("[aiAnalysis] VEPIP_INTERNAL_SECRET not set — skipping");
      return;
    }

    try {
      const res = await fetch(`${siteUrl}/api/ai/analyze-projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": secret,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[aiAnalysis] Analysis failed:", text);
        return;
      }

      const data = await res.json();
      console.log("[aiAnalysis] Weekly analysis triggered. Thread:", data.threadId);
    } catch (err) {
      console.error("[aiAnalysis] Error triggering analysis:", err);
    }
  },
});
```

- [ ] **Step 3: Verify Convex deploys without errors**

Run: `npx convex dev`

Expected: no errors. New cron appears in Convex dashboard under Functions → Crons.

- [ ] **Step 4: Manually test the analysis endpoint**

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/ai/analyze-projects" `
  -Method POST `
  -Headers @{ "x-internal-secret" = "vepip-deerflow-secret-2026"; "Content-Type" = "application/json" } `
  -Body '{}'
```

Expected: `{ "ok": true, "threadId": "..." }` and new alerts appear in VEPIP's alerts section within a minute.

- [ ] **Step 5: Commit**

```bash
git add convex/crons.ts convex/aiAnalysis.ts
git commit -m "feat: add weekly proactive AI analysis cron via DeerFlow"
```

---

## Final Verification

- [ ] Both services start cleanly: `npm run dev` (port 3000) + DeerFlow on port 8001
- [ ] Chat streams tokens in real-time for any question
- [ ] Agent reads live Convex data when asked about a project
- [ ] Agent asks confirmation before writing; data appears in Convex UI after "yes"
- [ ] Thread ID persists in localStorage — starting new browser session resumes conversation context
- [ ] "New chat" button clears thread and starts fresh
- [ ] `/api/ai/analyze-projects` endpoint creates real alerts in Convex
- [ ] All existing VEPIP pages (dashboard, CRM, finance, analytics) still work unchanged
