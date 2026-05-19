# Sub-project C — Proactive Autonomy

**Date**: 2026-05-19
**Status**: Design (proceed-without-review)
**Part of**: VEPIP Intelligence Program Roadmap
**Depends on**: Sub-projects A (grounding) and B (entity graph)

---

## Problem

VEPIP's only proactive surface today is a weekly cron that asks the agent "find risks across all projects, write alerts". This misses three classes of work that the system has all the data to do automatically:

1. **Scheduled lifecycle events** — a report period closes, a deliverable due-date approaches, a funder reporting cadence ticks over. Today, nothing nudges anyone until someone opens the project.
2. **Threshold breaches** — budget utilisation crosses 90 %, activity log silence > 21 days, a deliverable's progress flat-lines for 30 days. Today, alerts only get written if the weekly cron happens to catch them.
3. **Upload-driven extraction** — a PM uploads a PDF trip report, a photo album from a workshop, or a forwarded email. Today, nothing reads it; the data has to be manually re-typed into activities/expenses.

## Principle

> Nothing writes to live tables without explicit human confirmation. Every proactive output lands in `aiSuggestions` for a PM to accept, edit, or dismiss.

## Architecture

```
              Convex triggers           Webhook / upload triggers
              ─────────────────         ───────────────────────────
              cron(daily 06:00 IST)      POST /api/ai/proactive-event
              cron(hourly thresholds)         (from file upload hook)
                       │                              │
                       └──────────────┬───────────────┘
                                      ▼
                       internal.aiProactive.handleEvent
                                      │
                       ┌──────────────┼──────────────┐
                       ▼              ▼              ▼
                  Drafts a       Drafts a         Drafts an
                  report         digest           activity prefill
                  + chunks       + alerts         + receipt
                       │              │              │
                       └──────────────┼──────────────┘
                                      ▼
                              aiSuggestions table
                              (UI inbox surface)
                                      │
                                      ▼  user accept/edit/dismiss
                                live tables
```

## Schema additions

```ts
aiSuggestions: defineTable({
  projectId: v.optional(v.id("projects")),
  kind: v.union(
    v.literal("report_draft"),
    v.literal("activity_prefill"),
    v.literal("expense_prefill"),
    v.literal("alert"),
    v.literal("digest"),
  ),
  title: v.string(),
  summary: v.string(),
  payload: v.any(),  // typed per kind — what would be written if accepted
  status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("dismissed"), v.literal("edited")),
  createdAt: v.number(),
  reviewedBy: v.optional(v.id("people")),
  reviewedAt: v.optional(v.number()),
  source: v.union(v.literal("scheduled"), v.literal("threshold"), v.literal("upload")),
  sourceRef: v.optional(v.string()),  // event id, storageId, etc.
}).index("by_project", ["projectId"])
  .index("by_status", ["status"])
  .index("by_kind", ["kind"]),

proactiveEvents: defineTable({
  kind: v.string(),  // "deliverable_due_minus_7", "budget_over_90", "upload_received", ...
  payload: v.any(),
  triggeredAt: v.number(),
  processedAt: v.optional(v.number()),
  resultSuggestionId: v.optional(v.id("aiSuggestions")),
}).index("by_kind", ["kind"]),
```

## Trigger sources

| Class | Trigger | Cron / hook |
|---|---|---|
| Scheduled | `deliverable.dueDate - 7 days` | daily cron iterates `deliverables` index `by_due_date` |
| Scheduled | report `periodEnd` reached | daily cron iterates `reports` |
| Scheduled | funder reporting cadence due | weekly cron iterates `funders.reportingCadence` |
| Threshold | budget category `spentAmount / approvedAmount > 0.9` | hourly cron |
| Threshold | activity silence: no `activities` in last 21 days for active project | hourly cron |
| Threshold | deliverable flat-line: `achieved` unchanged for 30 days | hourly cron |
| Upload | new `_storage` PDF/image/email tagged to a project | hook in `convex/files.ts` after upload completes |

## DeerFlow side

A new tool group `vepip-proactive`:
- `draft_period_report(project_id, period_start, period_end)` — agent gathers data, drafts narrative, writes to `aiSuggestions` (kind `report_draft`).
- `extract_activity_from_text(project_id, text, source_ref)` — given an uploaded PDF/email body, agent extracts structured `activity_prefill` payload, writes to `aiSuggestions`.
- `draft_weekly_digest(person_id)` — for each project a PM manages, summarise "what changed this week", writes one `aiSuggestions` of kind `digest` per PM per week.

DeerFlow agent is invoked via existing `/api/ai/analyze-projects` route, with payload `{ event: "deliverable_due_minus_7", deliverable_id: "..." }`. The route translates each event class into a specific agent prompt.

## UI changes

- New `(main)/inbox/page.tsx` lists pending `aiSuggestions` for the current user, grouped by project.
- Each suggestion card shows: title, summary, payload preview (as readable diff or prefilled form), and three actions: **Accept** (runs the canonical mutation), **Edit** (opens the relevant form prefilled), **Dismiss** (marks status, no write).
- Sidebar gets an Inbox count badge (live via Convex query).

## RBAC

Suggestions are visible only to users with access to their `projectId` (program manager, account manager, project members, admin, leadership). Org-level suggestions (`projectId == null`) visible to admin + leadership.

## Noise control

- Per-user "snooze" setting in `people.aiPreferences` (deferred — v1 uses global thresholds).
- Suggestions of the same `(kind, projectId, sourceRef)` collapse: if a pending one exists, update it instead of inserting a duplicate.
- Auto-dismiss suggestions older than 30 days.
- Per-PM digest cap: max 1 digest per week.

## Acceptance criteria

- Within one quarter, at least 1 of each suggestion kind (report_draft, activity_prefill, digest, alert) is accepted (not dismissed) per active project.
- Zero suggestions ever auto-write to canonical tables (regression test asserts this).
- Threshold cron processes the current DB in < 10 seconds.
- An accepted `report_draft` produces a `reports` row identical to running the existing manual report-generation path.

## Phases

| # | Deliverable | Files |
|---|---|---|
| 1 | Schema additions | `convex/schema.ts` |
| 2 | Cron triggers | `convex/crons.ts`, `convex/aiProactive.ts` (NEW) |
| 3 | Upload hook | `convex/files.ts` |
| 4 | DeerFlow tools + new prompt translations | `convex/_generated/api`, `community/vepip/tools.py`, route `/api/ai/proactive-event` |
| 5 | Inbox UI | `src/app/(main)/inbox/page.tsx` (NEW), sidebar badge |
| 6 | Accept/edit/dismiss flow → canonical mutations | inbox card components |

## Out of scope

- Email/Slack notifications (deferred — pull-based inbox only in v1).
- Auto-accept for "trusted" suggestion types (deferred — humans always confirm in v1).
- Cross-org or admin-wide bulk-accept tools.
