import { NextResponse } from "next/server";
import { deerflowFetch } from "@/lib/deerflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Heuristics: any of these → enable plan_mode (TodoList middleware) and a stronger temperature.
const PLAN_KEYWORDS = [
  "report",
  "analy",
  "compare",
  "all projects",
  "across",
  "portfolio",
  "summary",
  "summarise",
  "summarize",
  "and then",
  "then also",
  "multiple",
];

function shouldPlan(message: string): boolean {
  const lower = message.toLowerCase();
  return PLAN_KEYWORDS.some((k) => lower.includes(k));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      threadId: string;
      message: string;
      projectId?: string;
      projectName?: string;
      userEmail: string;
      today: string;
      modelName?: string;
    };

    const { threadId, message, projectId, projectName, userEmail, today, modelName } = body;

    if (!threadId || !message || !userEmail) {
      return NextResponse.json(
        { error: "threadId, message, and userEmail are required" },
        { status: 400 },
      );
    }

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
    const planMode = shouldPlan(message);

    const deerflowRes = await deerflowFetch(
      `/api/threads/${threadId}/runs/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            messages: [{ role: "user", content: fullMessage }],
          },
          config: {
            configurable: {
              // Allow front-end override (e.g. for narrative-heavy work). Default Flash.
              model_name: modelName ?? "gemini-flash",
              // Plan mode enables TodoList middleware so the agent can write_todos
              // and execute step-by-step. Worth the small overhead for complex tasks.
              is_plan_mode: planMode,
            },
          },
          // "messages-tuple" gives us tool calls and tool results as discrete events,
          // not just final text. Required for tool-call visibility in the UI.
          stream_mode: ["messages-tuple", "values"],
        }),
      },
    );

    if (!deerflowRes.ok || !deerflowRes.body) {
      const text = await deerflowRes.text();
      console.error("[stream] DeerFlow error:", deerflowRes.status, text);
      return NextResponse.json({ error: text }, { status: deerflowRes.status });
    }

    return new Response(deerflowRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[stream] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
