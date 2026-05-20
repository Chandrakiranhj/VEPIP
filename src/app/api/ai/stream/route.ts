import { NextResponse } from "next/server";

import { getGeminiModel } from "@/lib/ai-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface StreamBody {
  message: string;
  projectId?: string;
  projectName?: string;
  userEmail: string;
  today: string;
  modelName?: string;
}

const CONVEX_SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
const INTERNAL_SECRET = process.env.VEPIP_INTERNAL_SECRET ?? "";

function sseData(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function compact(value: unknown, maxChars = 50_000) {
  const json = JSON.stringify(value);
  if (json.length <= maxChars) return json;
  return `${json.slice(0, maxChars)}... [truncated]`;
}

async function convexFetch(path: string, payload: Record<string, unknown>) {
  if (!CONVEX_SITE || !INTERNAL_SECRET) {
    throw new Error("Convex internal env vars are missing");
  }

  const res = await fetch(`${CONVEX_SITE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

function toolCallEvent(id: string, name: string, args: Record<string, unknown>) {
  return sseData([
    {
      type: "AIMessageChunk",
      id: `${id}-call`,
      content: "",
      tool_calls: [{ id, name, args }],
    },
    { source: "direct-convex" },
  ]);
}

function toolResultEvent(id: string, content: unknown, isError = false) {
  return sseData({
    type: "tool",
    tool_call_id: id,
    content: typeof content === "string" ? content : compact(content),
    status: isError ? "error" : "success",
  });
}

function assistantPrompt(body: StreamBody, context: Record<string, unknown>) {
  return `You are Vision Empower's project intelligence assistant inside VEPIP.

You are using the model API directly. There is no DeerFlow sidecar.

Style:
- Be concise, practical, and specific.
- Use the live Convex context and knowledge search snippets below.
- Do not invent project facts. Say what is missing when data is unavailable.
- Mention source titles when you use retrieved knowledge.

Write actions:
- You cannot silently write data.
- If the user asks to log, save, record, update, add, or create operational data, return a proposal marker before your short explanation.
- Proposal marker format:
  <!--vepip-proposal:{"tool":"log_activity","summary":"One sentence","args":{"projectId":"...","title":"...","activityDate":"YYYY-MM-DD"}}-->
- Supported tools: log_activity, record_expense, update_deliverable, add_milestone, add_testimonial, write_alert.
- Use IDs from project_context for categoryId and deliverableId when needed.
- Include projectId in args when the tool needs it.
- Never claim a write has happened until the user confirms the proposal card.

Fiscal year rule:
- Vision Empower uses Indian fiscal years: FY 26-27 is 2026-04-01 to 2027-03-31.
- When discussing dates, budgets, reports, or timelines, map them to the correct FY.

Context:
- user_email: ${body.userEmail}
- today: ${body.today}
- project_id: ${body.projectId ?? "none"}
- project_name: ${body.projectName ?? "none"}

Live data:
${compact(context, 90_000)}

User message:
${body.message}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StreamBody;

    if (!body.message || !body.userEmail) {
      return NextResponse.json({ error: "message and userEmail are required" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: unknown) => controller.enqueue(encoder.encode(sseData(data)));
        const sendRaw = (chunk: string) => controller.enqueue(encoder.encode(chunk));
        const context: Record<string, unknown> = {};

        if (body.projectId) {
          const id = crypto.randomUUID();
          sendRaw(toolCallEvent(id, "project_context", { projectId: body.projectId }));
          try {
            const projectContext = await convexFetch("/ai/project-context", {
              projectId: body.projectId,
              userEmail: body.userEmail,
            });
            context.project_context = projectContext;
            sendRaw(toolResultEvent(id, projectContext));
          } catch (err) {
            context.project_context_error = String(err);
            sendRaw(toolResultEvent(id, String(err), true));
          }
        }

        if (body.message.trim().length > 8) {
          const id = crypto.randomUUID();
          const filters = body.projectId ? { projectId: body.projectId } : undefined;
          sendRaw(toolCallEvent(id, "search_knowledge", { query: body.message, topK: 6, filters }));
          try {
            const knowledge = await convexFetch("/ai/search-knowledge", {
              userEmail: body.userEmail,
              query: body.message,
              topK: 6,
              filters,
            });
            context.search_knowledge = knowledge;
            sendRaw(toolResultEvent(id, knowledge));
          } catch (err) {
            context.search_knowledge_error = String(err);
            sendRaw(toolResultEvent(id, String(err), true));
          }
        }

        try {
          const model = getGeminiModel(body.modelName);
          const result = await model.generateContentStream({
            contents: [{ role: "user", parts: [{ text: assistantPrompt(body, context) }] }],
            generationConfig: { temperature: 0.25 },
          });

          const id = crypto.randomUUID();
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (!text) continue;
            send([
              {
                type: "AIMessageChunk",
                id,
                content: text,
              },
              { source: "direct-gemini" },
            ]);
          }
        } catch (err) {
          send({ type: "AIMessageChunk", id: crypto.randomUUID(), content: `\n\n${String(err)}` });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[stream] direct model error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
