import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

const DOCUMENT_KIND = v.union(
  v.literal("project_summary"),
  v.literal("mou"),
  v.literal("proposal"),
  v.literal("report_draft"),
  v.literal("activity_note"),
  v.literal("testimonial"),
  v.literal("meeting_note"),
  v.literal("uploaded_pdf"),
);

type DocumentKind = Doc<"documents">["kind"];

function hashText(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc2b2ae35;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822507) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

// ── Upsert a document row, dedup by source+hash ─────────────────────────────

export const upsertDocument = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    kind: DOCUMENT_KIND,
    sourceTable: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    title: v.string(),
    text: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ documentId: Id<"documents">; needsEmbedding: boolean }> => {
    const textHash = hashText(args.text);
    const now = Date.now();

    let existing: Doc<"documents"> | null = null;
    if (args.sourceTable && args.sourceId) {
      existing = await ctx.db
        .query("documents")
        .withIndex("by_source", (q) =>
          q.eq("sourceTable", args.sourceTable).eq("sourceId", args.sourceId),
        )
        .unique();
    }

    if (existing) {
      if (existing.textHash === textHash && existing.indexedAt) {
        return { documentId: existing._id, needsEmbedding: false };
      }
      await ctx.db.patch(existing._id, {
        projectId: args.projectId,
        kind: args.kind,
        storageId: args.storageId,
        title: args.title,
        text: args.text,
        textHash,
      });
      return { documentId: existing._id, needsEmbedding: true };
    }

    const id = await ctx.db.insert("documents", {
      projectId: args.projectId,
      kind: args.kind,
      sourceTable: args.sourceTable,
      sourceId: args.sourceId,
      storageId: args.storageId,
      title: args.title,
      text: args.text,
      textHash,
      createdAt: now,
    });
    return { documentId: id, needsEmbedding: true };
  },
});

// ── Replace all chunks for a document atomically ────────────────────────────

export const replaceChunks = internalMutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.optional(v.id("projects")),
    kind: v.string(),
    chunks: v.array(
      v.object({
        text: v.string(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    const now = Date.now();
    let i = 0;
    for (const chunk of args.chunks) {
      await ctx.db.insert("documentChunks", {
        documentId: args.documentId,
        projectId: args.projectId,
        kind: args.kind,
        chunkIndex: i++,
        text: chunk.text,
        embedding: chunk.embedding,
        createdAt: now,
      });
    }
    await ctx.db.patch(args.documentId, { indexedAt: now });
  },
});

// ── Fetch document for embedding (Node action reads this) ────────────────────

export const getDocumentForEmbedding = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) return null;
    return {
      _id: doc._id,
      projectId: doc.projectId,
      kind: doc.kind,
      text: doc.text,
      title: doc.title,
    };
  },
});

// ── Convenience: upsert + schedule embedding ────────────────────────────────

export const upsertAndSchedule = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    kind: DOCUMENT_KIND,
    sourceTable: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    title: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"documents">> => {
    const { documentId, needsEmbedding } = await ctx.runMutation(
      internal.aiIngest.upsertDocument,
      args,
    );
    if (needsEmbedding) {
      await ctx.scheduler.runAfter(
        0,
        internal.aiIngestNode.embedAndStore,
        { documentId },
      );
    }
    return documentId;
  },
});

// ── Backfill: enqueue ingestion for every existing source row ──────────────

export const backfillAllDocuments = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const queued = await ctx.runMutation(
      internal.aiIngest.backfillEnqueueAll,
      {},
    );
    return { scheduled: queued };
  },
});

export const backfillEnqueueAll = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    let scheduled = 0;

    const projects = await ctx.db.query("projects").collect();
    for (const p of projects) {
      const text = [
        p.name,
        p.funderName ? `Funder: ${p.funderName}` : "",
        p.summary ?? "",
        p.states?.length ? `States: ${p.states.join(", ")}` : "",
        `Grant: ₹${p.grantAmount}`,
        `Dates: ${p.startDate} → ${p.endDate}`,
      ]
        .filter(Boolean)
        .join("\n");
      await ctx.runMutation(internal.aiIngest.upsertAndSchedule, {
        projectId: p._id,
        kind: "project_summary",
        sourceTable: "projects",
        sourceId: p._id,
        title: p.name,
        text,
      });
      scheduled++;
      if (p.mouStorageId) {
        await ctx.scheduler.runAfter(
          0,
          internal.aiIngestNode.extractStorageFile,
          {
            projectId: p._id,
            kind: "mou",
            sourceTable: "projects",
            sourceId: `${p._id}:mou`,
            storageId: p.mouStorageId,
            title: `${p.name} — MoU`,
          },
        );
        scheduled++;
      }
      if (p.proposalStorageId) {
        await ctx.scheduler.runAfter(
          0,
          internal.aiIngestNode.extractStorageFile,
          {
            projectId: p._id,
            kind: "proposal",
            sourceTable: "projects",
            sourceId: `${p._id}:proposal`,
            storageId: p.proposalStorageId,
            title: `${p.name} — Proposal`,
          },
        );
        scheduled++;
      }
    }

    const activities = await ctx.db.query("activities").collect();
    for (const a of activities) {
      const text = [
        a.title,
        a.notes ?? "",
        a.testimonial ? `Quote: ${a.testimonial}${a.testimonialBy ? ` — ${a.testimonialBy}` : ""}` : "",
        a.state ? `State: ${a.state}` : "",
        a.location ? `Location: ${a.location}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      if (!text.trim()) continue;
      await ctx.runMutation(internal.aiIngest.upsertAndSchedule, {
        projectId: a.projectId,
        kind: "activity_note",
        sourceTable: "activities",
        sourceId: a._id,
        title: `${a.activityDate} — ${a.title}`,
        text,
      });
      scheduled++;
    }

    const reports = await ctx.db.query("reports").collect();
    for (const r of reports) {
      if (!r.draft) continue;
      await ctx.runMutation(internal.aiIngest.upsertAndSchedule, {
        projectId: r.projectId,
        kind: "report_draft",
        sourceTable: "reports",
        sourceId: r._id,
        title: r.title ?? `Report ${r.periodStart} → ${r.periodEnd}`,
        text: r.draft,
      });
      scheduled++;
    }

    const testimonials = await ctx.db.query("testimonials").collect();
    for (const t of testimonials) {
      await ctx.runMutation(internal.aiIngest.upsertAndSchedule, {
        projectId: t.projectId,
        kind: "testimonial",
        sourceTable: "testimonials",
        sourceId: t._id,
        title: `${t.author}${t.role ? ` (${t.role})` : ""}`,
        text: t.content,
      });
      scheduled++;
    }

    return scheduled;
  },
});

// ── Accessible projectIds for RBAC filtering in search ──────────────────────

export const getAccessibleProjectIds = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return { all: false, projectIds: [] as Id<"projects">[] };
    if (person.role === "admin" || person.role === "leadership") {
      return { all: true, projectIds: [] as Id<"projects">[] };
    }
    const projects = await ctx.db.query("projects").collect();
    const owned = projects
      .filter(
        (p) =>
          p.programManagerId === person._id || p.accountManagerId === person._id,
      )
      .map((p) => p._id);
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect();
    const membered = memberships.map((m) => m.projectId);
    const dedup = Array.from(new Set([...owned, ...membered]));
    return { all: false, projectIds: dedup };
  },
});

// ── Fetch chunks + parent docs after vector search (used by search action) ──

export const hydrateSearchResults = internalQuery({
  args: { chunkIds: v.array(v.id("documentChunks")) },
  handler: async (ctx, { chunkIds }) => {
    const chunks: Array<{
      chunkId: Id<"documentChunks">;
      documentId: Id<"documents">;
      projectId?: Id<"projects">;
      text: string;
      kind: string;
      title: string;
      sourceTable?: string;
      sourceId?: string;
      projectName?: string;
      createdAt: number;
    }> = [];
    const projectNameCache = new Map<string, string>();

    for (const chunkId of chunkIds) {
      const chunk = await ctx.db.get(chunkId);
      if (!chunk) continue;
      const doc = await ctx.db.get(chunk.documentId);
      if (!doc) continue;
      let projectName: string | undefined;
      if (chunk.projectId) {
        const cached = projectNameCache.get(chunk.projectId);
        if (cached) {
          projectName = cached;
        } else {
          const project = await ctx.db.get(chunk.projectId);
          if (project) {
            projectName = project.name;
            projectNameCache.set(chunk.projectId, project.name);
          }
        }
      }
      chunks.push({
        chunkId: chunk._id,
        documentId: chunk.documentId,
        projectId: chunk.projectId,
        text: chunk.text,
        kind: chunk.kind,
        title: doc.title,
        sourceTable: doc.sourceTable,
        sourceId: doc.sourceId,
        projectName,
        createdAt: doc.createdAt,
      });
    }
    return chunks;
  },
});

export type { DocumentKind };
