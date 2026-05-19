import { deerflowFetch } from "@/lib/deerflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string; path: string[] }> },
) {
  const { threadId, path } = await context.params;
  if (!threadId || !path?.length) {
    return new Response("Missing threadId or path", { status: 400 });
  }

  // DeerFlow artifact paths are rooted at the virtual mount (e.g.
  // `mnt/user-data/outputs/file.docx`). The skill emits short paths like
  // `outputs/file.docx`; prepend `mnt/user-data` when the caller skipped it.
  const segments = path[0] === "mnt" ? path : ["mnt", "user-data", ...path];
  const safePath = segments.map((p) => encodeURIComponent(p)).join("/");

  const url = new URL(request.url);
  const download = url.searchParams.get("download");
  const qs = download ? `?download=${encodeURIComponent(download)}` : "";

  try {
    const res = await deerflowFetch(
      `/api/threads/${encodeURIComponent(threadId)}/artifacts/${safePath}${qs}`,
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
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    console.error("[artifact] error:", err);
    return new Response("Failed to fetch artifact", { status: 500 });
  }
}
