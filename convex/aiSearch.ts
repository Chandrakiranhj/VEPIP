"use node";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

const EMBED_MODEL = "text-embedding-004";
const DEFAULT_TOP_K = 8;
const OVERSAMPLE = 3;

const KIND_LITERAL = v.union(
  v.literal("project_summary"),
  v.literal("mou"),
  v.literal("proposal"),
  v.literal("report_draft"),
  v.literal("activity_note"),
  v.literal("testimonial"),
  v.literal("meeting_note"),
  v.literal("uploaded_pdf"),
);

function getGeminiClient(): GoogleGenerativeAI {
  const key =
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_AI_API_KEY env var is required for search");
  }
  return new GoogleGenerativeAI(key);
}

interface HydratedChunk {
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
}

interface SearchResult {
  results: Array<{
    chunkId: Id<"documentChunks">;
    documentId: Id<"documents">;
    score: number;
    text: string;
    source: {
      kind: string;
      title: string;
      projectId: Id<"projects"> | null;
      projectName: string | null;
      sourceTable: string | null;
      sourceId: string | null;
      createdAt: number;
    };
  }>;
  elapsedMs: number;
  error?: string;
}

export const searchKnowledge = internalAction({
  args: {
    userEmail: v.string(),
    query: v.string(),
    topK: v.optional(v.number()),
    filters: v.optional(
      v.object({
        projectId: v.optional(v.id("projects")),
        kinds: v.optional(v.array(KIND_LITERAL)),
        dateFrom: v.optional(v.string()),
        dateTo: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<SearchResult> => {
    const topK = Math.min(Math.max(args.topK ?? DEFAULT_TOP_K, 1), 25);
    const filters = args.filters ?? {};

    const person = await ctx.runQuery(
      internal.people.getByEmailInternal,
      { email: args.userEmail.trim().toLowerCase() },
    );
    if (!person) {
      return { results: [], elapsedMs: 0, error: "user_not_found" };
    }

    const access: { all: boolean; projectIds: Id<"projects">[] } = await ctx.runQuery(
      internal.aiIngest.getAccessibleProjectIds,
      { personId: person._id },
    );

    if (
      filters.projectId &&
      !access.all &&
      !access.projectIds.includes(filters.projectId)
    ) {
      return { results: [], elapsedMs: 0, error: "no_access" };
    }

    const started = Date.now();
    let queryVector: number[];
    try {
      const genAI = getGeminiClient();
      const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
      const res = await model.embedContent(args.query);
      queryVector = res.embedding.values;
    } catch (err) {
      console.error("[aiSearch] embed_failed", err);
      return { results: [], elapsedMs: 0, error: "embedding_unavailable" };
    }

    // Convex's vectorSearch `filter` callback must return a FilterExpression,
    // not the builder itself. Pass the option only when we actually have a
    // filter; otherwise omit it.
    const projectFilter = filters.projectId;
    const candidates = await ctx.vectorSearch(
      "documentChunks",
      "by_embedding",
      projectFilter
        ? {
            vector: queryVector,
            limit: topK * OVERSAMPLE,
            filter: (q) => q.eq("projectId", projectFilter),
          }
        : {
            vector: queryVector,
            limit: topK * OVERSAMPLE,
          },
    );

    if (candidates.length === 0) {
      return { results: [], elapsedMs: Date.now() - started };
    }

    const hydrated: HydratedChunk[] = await ctx.runQuery(
      internal.aiIngest.hydrateSearchResults,
      { chunkIds: candidates.map((c) => c._id) },
    );

    const scoreById = new Map<string, number>(
      candidates.map((c) => [String(c._id), c._score]),
    );

    let filtered: HydratedChunk[] = hydrated.filter((chunk: HydratedChunk) => {
      if (!access.all) {
        if (!chunk.projectId) return false;
        if (!access.projectIds.includes(chunk.projectId)) return false;
      }
      if (filters.kinds?.length && !filters.kinds.includes(chunk.kind as never)) {
        return false;
      }
      if (filters.dateFrom) {
        const fromMs = Date.parse(filters.dateFrom);
        if (!Number.isNaN(fromMs) && chunk.createdAt < fromMs) return false;
      }
      if (filters.dateTo) {
        const toMs = Date.parse(filters.dateTo);
        if (!Number.isNaN(toMs) && chunk.createdAt > toMs) return false;
      }
      return true;
    });

    filtered.sort(
      (a: HydratedChunk, b: HydratedChunk) =>
        (scoreById.get(String(b.chunkId)) ?? 0) -
        (scoreById.get(String(a.chunkId)) ?? 0),
    );
    filtered = filtered.slice(0, topK);

    return {
      results: filtered.map((c: HydratedChunk) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        score: scoreById.get(String(c.chunkId)) ?? 0,
        text: c.text,
        source: {
          kind: c.kind,
          title: c.title,
          projectId: c.projectId ?? null,
          projectName: c.projectName ?? null,
          sourceTable: c.sourceTable ?? null,
          sourceId: c.sourceId ?? null,
          createdAt: c.createdAt,
        },
      })),
      elapsedMs: Date.now() - started,
    };
  },
});
