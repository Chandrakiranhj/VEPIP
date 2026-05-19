"use node";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

const EMBED_MODEL = "text-embedding-004";
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    let cut = end;
    if (end < clean.length) {
      const lastBreak = Math.max(
        clean.lastIndexOf("\n\n", end),
        clean.lastIndexOf(". ", end),
        clean.lastIndexOf("\n", end),
      );
      if (lastBreak > start + CHUNK_SIZE / 2) cut = lastBreak;
    }
    chunks.push(clean.slice(start, cut).trim());
    if (cut >= clean.length) break;
    start = Math.max(0, cut - CHUNK_OVERLAP);
  }
  return chunks.filter((c) => c.length > 0);
}

function getGeminiClient(): GoogleGenerativeAI {
  const key =
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_AI_API_KEY (or GEMINI_API_KEY) env var is required for embedding",
    );
  }
  return new GoogleGenerativeAI(key);
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const out: number[][] = [];
  for (const text of texts) {
    const res = await model.embedContent(text);
    out.push(res.embedding.values);
  }
  return out;
}

export const embedText = internalAction({
  args: { text: v.string() },
  handler: async (_ctx, { text }) => {
    const [vec] = await embedTexts([text]);
    return vec;
  },
});

export const embedAndStore = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runQuery(
      internal.aiIngest.getDocumentForEmbedding,
      { documentId },
    );
    if (!doc) return { ok: false, reason: "document_not_found" } as const;
    const pieces = chunkText(doc.text);
    if (pieces.length === 0) {
      await ctx.runMutation(internal.aiIngest.replaceChunks, {
        documentId,
        projectId: doc.projectId,
        kind: doc.kind,
        chunks: [],
      });
      return { ok: true, chunks: 0 } as const;
    }
    let embeddings: number[][];
    try {
      embeddings = await embedTexts(pieces);
    } catch (err) {
      console.error("[aiIngestNode.embedAndStore] embed failed", err);
      return { ok: false, reason: "embed_failed" } as const;
    }
    await ctx.runMutation(internal.aiIngest.replaceChunks, {
      documentId,
      projectId: doc.projectId,
      kind: doc.kind,
      chunks: pieces.map((text, i) => ({ text, embedding: embeddings[i] })),
    });
    return { ok: true, chunks: pieces.length } as const;
  },
});

export const extractStorageFile = internalAction({
  args: {
    projectId: v.optional(v.id("projects")),
    kind: v.union(
      v.literal("mou"),
      v.literal("proposal"),
      v.literal("uploaded_pdf"),
    ),
    sourceTable: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    storageId: v.id("_storage"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      console.warn("[aiIngestNode.extractStorageFile] storage object missing", args.storageId);
      return { ok: false, reason: "storage_missing" } as const;
    }
    let text = "";
    try {
      const buf = Buffer.from(await blob.arrayBuffer());
      // pdf-parse v2 ships as ESM with named exports; v1 was a default-export
      // function. Tolerate both at runtime.
      const mod = (await import("pdf-parse")) as unknown as Record<string, unknown>;
      const fn =
        (mod.default as ((b: Buffer) => Promise<{ text?: string }>) | undefined) ??
        (mod.extractText as ((b: Buffer) => Promise<string | { text?: string }>) | undefined) ??
        (mod as unknown as (b: Buffer) => Promise<{ text?: string }>);
      const parsed = await (fn as (b: Buffer) => Promise<unknown>)(buf);
      if (typeof parsed === "string") {
        text = parsed.trim();
      } else if (parsed && typeof parsed === "object" && "text" in parsed) {
        text = String((parsed as { text?: string }).text ?? "").trim();
      }
    } catch (err) {
      console.error("[aiIngestNode.extractStorageFile] pdf-parse failed", err);
      text = `[extraction failed: ${(err as Error).message}]`;
    }
    if (!text) {
      text = "[empty or unreadable PDF]";
    }
    const documentId: Id<"documents"> = await ctx.runMutation(
      internal.aiIngest.upsertAndSchedule,
      {
        projectId: args.projectId,
        kind: args.kind,
        sourceTable: args.sourceTable,
        sourceId: args.sourceId,
        storageId: args.storageId,
        title: args.title,
        text,
      },
    );
    return { ok: true, documentId } as const;
  },
});
