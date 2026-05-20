import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONVEX_SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
const INTERNAL_SECRET = process.env.VEPIP_INTERNAL_SECRET ?? "";
const ADMIN_EMAIL = process.env.VEPIP_ADMIN_EMAIL ?? "";

async function convexFetch(path: string, payload: object = {}) {
  if (!CONVEX_SITE || !INTERNAL_SECRET) throw new Error("Convex internal env vars are missing");
  if (!ADMIN_EMAIL) throw new Error("VEPIP_ADMIN_EMAIL is required for scheduled AI analysis");
  const res = await fetch(`${CONVEX_SITE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_SECRET}`,
    },
    body: JSON.stringify({ userEmail: ADMIN_EMAIL, ...payload }),
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${await res.text().catch(() => "")}`);
  return res.json();
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== process.env.VEPIP_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = (await convexFetch("/ai/org-summary")) as {
      projects?: Array<{ id: string; name: string; status: string; endDate?: string }>;
    };
    let alertsCreated = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const project of summary.projects ?? []) {
      if (project.status !== "at_risk" && project.status !== "overdue") continue;
      const severity = project.status === "overdue" ? "critical" : "watch";
      await convexFetch("/ai/write-alert", {
        projectId: project.id,
        title: `${project.name} needs review (${project.status.replace(/_/g, " ")}) as of ${today}`,
        severity,
      });
      alertsCreated++;
    }

    return NextResponse.json({ ok: true, mode: "direct", alertsCreated });
  } catch (err) {
    console.error("[analyze-projects] direct analysis failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
