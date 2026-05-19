import { NextResponse } from "next/server";
import { deerflowFetch } from "@/lib/deerflow";
import { extractPdfDocument } from "@/lib/pdf-extraction";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Clean and truncate text to stay within LLM context limits. */
function cleanAndTruncate(text: string, maxChars = 1_500_000): string {
  const cleaned = text
    .replace(/[\r\n]{3,}/g, "\n\n")
    .replace(/[ \t]{3,}/g, " ")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  console.warn(`[AI Intake] Truncating ${cleaned.length} → ${maxChars} chars`);
  return cleaned.slice(0, maxChars);
}

/** Extract plain text from a File. Supports PDF, DOCX, plain text. */
async function extractTextFromFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  let text = "";
  if (lowerName.endsWith(".pdf")) {
    const extracted = await extractPdfDocument(buffer);
    text = [
      `PDF extraction mode: ${extracted.usedOcr ? "native text + OCR fallback" : "native text + layout elements"}`,
      extracted.text,
    ].join("\n\n");
  } else if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value ?? "";
  } else {
    text = buffer.toString("utf-8");
  }

  return cleanAndTruncate(text);
}

/** Pull the first ```json fenced block out of a streaming/non-streaming response. */
function extractJsonBlock(raw: string): string | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  // Fall back to first balanced object
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return null;
}

/** Read a SSE response body (LangGraph "messages-tuple" style) and return the
 *  concatenated assistant text. */
async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const aiTextById: Record<string, string> = {};
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const evt of events) {
      let dataLine: string | null = null;
      for (const line of evt.split(/\r?\n/)) {
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine || dataLine === "[DONE]") continue;
      try {
        const parsed = JSON.parse(dataLine);
        // LangGraph "messages-tuple" mode: [message, metadata]
        if (Array.isArray(parsed) && parsed.length >= 1) {
          const [msg] = parsed;
          if (msg && typeof msg === "object" && msg.type === "AIMessageChunk") {
            const id = String(msg.id ?? "");
            const content = msg.content;
            if (typeof content === "string") {
              aiTextById[id] = (aiTextById[id] ?? "") + content;
            } else if (Array.isArray(content)) {
              for (const part of content) {
                if (part?.type === "text" && typeof part.text === "string") {
                  aiTextById[id] = (aiTextById[id] ?? "") + part.text;
                }
              }
            }
          }
        }
      } catch {
        // ignore non-JSON event payloads
      }
    }
  }

  return Object.values(aiTextById).join("\n").trim();
}

async function callDeerflowIntake(proposalText: string, mouText: string, today: string): Promise<unknown> {
  const threadRes = await deerflowFetch("/api/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!threadRes.ok) {
    throw new Error(`DeerFlow thread create failed: ${threadRes.status} ${await threadRes.text()}`);
  }
  const { thread_id } = (await threadRes.json()) as { thread_id: string };

  const prompt = `<context>
today: ${today}
task: extract-project
</context>

Use the **vepip-intake** skill (see /mnt/skills/custom/vepip-intake/SKILL.md). Extract a structured project plan from the documents below.

Reply with exactly one fenced \`\`\`json block — nothing else.

--- PROPOSAL TEXT ---
${proposalText || "(no proposal supplied)"}

--- MOU / AGREEMENT TEXT ---
${mouText || "(no MOU supplied)"}`;

  const runRes = await deerflowFetch(`/api/threads/${thread_id}/runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { messages: [{ role: "user", content: prompt }] },
      // Use the "kimi" model registered in deer-flow/config.yaml. This name
      // matches the `models[0].name` entry; production runs on Moonshot's
      // moonshot-v1-auto via the OpenAI-compatible endpoint.
      config: { configurable: { model_name: "kimi" } },
      stream_mode: ["messages-tuple"],
    }),
  });
  if (!runRes.ok || !runRes.body) {
    throw new Error(`DeerFlow run failed: ${runRes.status} ${await runRes.text()}`);
  }

  const fullText = await consumeStream(runRes.body);
  const jsonStr = extractJsonBlock(fullText);
  if (!jsonStr) {
    throw new Error(`No JSON block in DeerFlow response. Raw: ${fullText.slice(0, 500)}`);
  }
  return JSON.parse(jsonStr);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let proposalText = "";
    let mouText = "";

    if (contentType.includes("multipart/form-data")) {
      console.log("[AI Intake] Parsing multipart form data");
      const formData = await request.formData();

      const proposalFile = formData.get("proposal");
      const mouFile = formData.get("mou");

      if (proposalFile && proposalFile instanceof File) {
        console.log(`[AI Intake] Extracting proposal: ${proposalFile.name} (${proposalFile.size}B)`);
        proposalText = await extractTextFromFile(proposalFile);
      }
      if (mouFile && mouFile instanceof File) {
        console.log(`[AI Intake] Extracting MOU: ${mouFile.name} (${mouFile.size}B)`);
        mouText = await extractTextFromFile(mouFile);
      }
      if (!proposalText) proposalText = String(formData.get("proposalText") ?? "");
      if (!mouText) mouText = String(formData.get("mouText") ?? "");
    } else {
      const body = await request.json();
      proposalText = String(body.proposalText ?? "");
      mouText = String(body.mouText ?? "");
    }

    if (!proposalText && !mouText) {
      return NextResponse.json(
        { error: "Please upload at least one document (Proposal or MOU)." },
        { status: 400 },
      );
    }

    // Cap combined size before sending to DeerFlow
    const totalLen = proposalText.length + mouText.length;
    if (totalLen > 1_500_000) {
      if (proposalText && mouText) {
        proposalText = cleanAndTruncate(proposalText, 750_000);
        mouText = cleanAndTruncate(mouText, 750_000);
      } else if (proposalText) {
        proposalText = cleanAndTruncate(proposalText, 1_500_000);
      } else {
        mouText = cleanAndTruncate(mouText, 1_500_000);
      }
    }

    console.log(`[AI Intake] Sending ${proposalText.length + mouText.length} chars to DeerFlow vepip-intake skill`);
    const today = new Date().toISOString().slice(0, 10);
    const draft = await callDeerflowIntake(proposalText, mouText, today);

    console.log("[AI Intake] Draft extracted:",
      (draft as { projectName?: string })?.projectName || "(unnamed)");

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[AI Intake] ERROR during extraction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to extract project draft" },
      { status: 500 },
    );
  }
}
