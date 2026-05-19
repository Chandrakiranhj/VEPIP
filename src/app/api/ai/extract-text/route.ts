/**
 * Text-only extraction endpoint for the manual intake flow.
 *
 * Takes the same proposal/MoU file uploads the AI intake takes, runs them
 * through the existing PDF / DOCX / TXT parsers, and returns the cleaned
 * plain text. NO LLM call. NO DeerFlow. The browser-side manual-mode UI
 * embeds this text into a prompt template that the user then pastes into
 * their own preferred LLM (Claude / ChatGPT / Gemini).
 */
import { NextResponse } from "next/server";
import { extractPdfDocument } from "@/lib/pdf-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

function cleanAndTruncate(text: string, maxChars = 1_500_000): string {
  const cleaned = text
    .replace(/[\r\n]{3,}/g, "\n\n")
    .replace(/[ \t]{3,}/g, " ")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars);
}

async function extractTextFromFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    const extracted = await extractPdfDocument(buffer);
    return cleanAndTruncate(extracted.text);
  }
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return cleanAndTruncate(result.value ?? "");
  }
  return cleanAndTruncate(buffer.toString("utf-8"));
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
    }
    const formData = await request.formData();
    const proposalFile = formData.get("proposal");
    const mouFile = formData.get("mou");

    let proposalText = "";
    let mouText = "";
    if (proposalFile && proposalFile instanceof File && proposalFile.size > 0) {
      proposalText = await extractTextFromFile(proposalFile);
    }
    if (mouFile && mouFile instanceof File && mouFile.size > 0) {
      mouText = await extractTextFromFile(mouFile);
    }

    if (!proposalText && !mouText) {
      return NextResponse.json(
        { error: "Upload at least one file (proposal or MOU)." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      proposalText,
      mouText,
      proposalChars: proposalText.length,
      mouChars: mouText.length,
    });
  } catch (err) {
    console.error("[extract-text] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 500 },
    );
  }
}
