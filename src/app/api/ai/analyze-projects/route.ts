import { NextResponse } from "next/server";
import { deerflowFetch } from "@/lib/deerflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== process.env.VEPIP_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail =
    process.env.VEPIP_ADMIN_EMAIL ?? "chandrakiran@visionempowertrust.org";

  try {
    const threadRes = await deerflowFetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      const text = await threadRes.text();
      console.error("[analyze-projects] thread create failed:", text);
      return NextResponse.json(
        { error: "Failed to create analysis thread" },
        { status: 500 },
      );
    }

    const { thread_id } = (await threadRes.json()) as { thread_id: string };

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

    const runRes = await deerflowFetch(
      `/api/threads/${thread_id}/runs/wait`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            messages: [{ role: "user", content: analysisPrompt }],
          },
          config: {
            configurable: { model_name: "gemini-flash" },
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
