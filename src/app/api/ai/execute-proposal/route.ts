import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONVEX_SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
const INTERNAL_SECRET = process.env.VEPIP_INTERNAL_SECRET ?? "";

const TOOL_PATHS: Record<string, string> = {
  log_activity: "/ai/log-activity",
  record_expense: "/ai/record-expense",
  update_deliverable: "/ai/update-deliverable",
  add_milestone: "/ai/add-milestone",
  add_testimonial: "/ai/add-testimonial",
  write_alert: "/ai/write-alert",
};

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tool?: string;
      args?: Record<string, unknown>;
      projectId?: string;
      userEmail?: string;
    };

    const tool = body.tool ?? "";
    const path = TOOL_PATHS[tool];
    if (!path) {
      return NextResponse.json({ error: `Unsupported proposal tool: ${tool}` }, { status: 400 });
    }
    if (!body.userEmail) {
      return NextResponse.json({ error: "userEmail is required" }, { status: 400 });
    }

    const payload = {
      ...(body.args ?? {}),
      userEmail: body.userEmail,
      projectId: (body.args?.projectId as string | undefined) ?? body.projectId,
    };

    const result = await convexFetch(path, payload);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[execute-proposal] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
