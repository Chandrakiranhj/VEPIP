import { deerflowExecFetch } from "@/lib/deerflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_ID_RE = /^[a-f0-9]{32}$/;
const FILENAME_RE = /^[A-Za-z0-9_.-]+\.(pptx|docx|pdf)$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string; filename: string }> },
) {
  const { reportId, filename } = await context.params;
  if (!REPORT_ID_RE.test(reportId)) {
    return new Response("invalid reportId", { status: 400 });
  }
  if (!FILENAME_RE.test(filename)) {
    return new Response("invalid filename", { status: 400 });
  }

  try {
    const res = await deerflowExecFetch(
      `/api/exec/artifact/${encodeURIComponent(reportId)}/${encodeURIComponent(filename)}`,
      { method: "GET" },
    );

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return new Response(text || "Artifact not found", { status: res.status });
    }

    const headers = new Headers();
    const passthrough = ["content-type", "content-length", "content-disposition", "cache-control"];
    for (const h of passthrough) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("content-disposition")) {
      headers.set("content-disposition", `attachment; filename="${filename}"`);
    }
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    console.error("[exec-artifact] error:", err);
    return new Response("Failed to fetch artifact", { status: 500 });
  }
}
