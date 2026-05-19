import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

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

// ── POST /ai/project-context ──────────────────────────────────────────────────

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

// ── POST /ai/query-portfolio (sub-project B) ─────────────────────────────────

http.route({
  path: "/ai/query-portfolio",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { person, body } = await verifyInternalRequest(ctx, request);
      const api = (await import("./_generated/api")).internal;
      const access = await ctx.runQuery(api.aiIngest.getAccessibleProjectIds, {
        personId: person._id,
      });
      const data = await ctx.runQuery(api.aiEntities.portfolioByFilter, {
        accessibleProjectIds: access.projectIds,
        seeAll: access.all,
        theme: body.theme ? String(body.theme) : undefined,
        region: body.region ? String(body.region) : undefined,
        funder: body.funder ? String(body.funder) : undefined,
        fromDate: body.fromDate ? String(body.fromDate) : undefined,
        toDate: body.toDate ? String(body.toDate) : undefined,
      });
      return jsonOk(data);
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/entity-profile (sub-project B) ──────────────────────────────────

http.route({
  path: "/ai/entity-profile",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { person, body } = await verifyInternalRequest(ctx, request);
      const api = (await import("./_generated/api")).internal;
      const access = await ctx.runQuery(api.aiIngest.getAccessibleProjectIds, {
        personId: person._id,
      });
      const data = await ctx.runQuery(api.aiEntities.entityProfile, {
        accessibleProjectIds: access.projectIds,
        seeAll: access.all,
        kind: body.kind as "funder" | "person" | "region" | "theme" | "school",
        entityId: body.entityId as Id<"entities">,
      });
      return jsonOk(data);
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/remember-fact (sub-project B) ───────────────────────────────────

http.route({
  path: "/ai/remember-fact",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { person, body } = await verifyInternalRequest(ctx, request);
      // RBAC: admin/leadership only. PMs cannot write user-confirmed facts
      // about funders/regions they don't own. This keeps the entity graph
      // canonical and prevents drive-by edits.
      if (person.role !== "admin" && person.role !== "leadership") {
        return new Response("Only admin / leadership can remember facts", { status: 403 });
      }
      const id = await ctx.runMutation(
        (await import("./_generated/api")).internal.aiEntities.rememberFactInternal,
        {
          entityId: body.entityId as Id<"entities">,
          fact: String(body.fact ?? ""),
          confidence: typeof body.confidence === "number" ? body.confidence : undefined,
          createdBy: person._id,
        },
      );
      return jsonOk({ id });
    } catch (e) {
      if (e instanceof Response) return e;
      return new Response(String(e), { status: 500 });
    }
  }),
});

// ── POST /ai/search-knowledge ─────────────────────────────────────────────────

http.route({
  path: "/ai/search-knowledge",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { body } = await verifyInternalRequest(ctx, request);
      const data = await ctx.runAction(
        (await import("./_generated/api")).internal.aiSearch.searchKnowledge,
        {
          userEmail: String(body.userEmail),
          query: String(body.query ?? ""),
          topK: typeof body.topK === "number" ? body.topK : undefined,
          filters: body.filters ?? undefined,
        },
      );
      return jsonOk(data);
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
