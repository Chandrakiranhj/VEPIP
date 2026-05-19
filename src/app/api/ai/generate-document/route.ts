import { NextResponse } from "next/server";
import { DeerflowUnreachableError, deerflowExecFetch } from "@/lib/deerflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Format = "docx" | "pdf" | "pptx";
type ReportType = "quarterly" | "full";

function isValidFormat(v: string): v is Format {
  return v === "docx" || v === "pdf" || v === "pptx";
}

function safeSlug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "report";
}

const CONVEX_SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
const INTERNAL_SECRET = process.env.VEPIP_INTERNAL_SECRET ?? "";

async function convexFetch(path: string, payload: object): Promise<unknown> {
  if (!CONVEX_SITE || !INTERNAL_SECRET) {
    throw new Error("Convex env vars missing (NEXT_PUBLIC_CONVEX_SITE_URL / VEPIP_INTERNAL_SECRET)");
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
    const t = await res.text().catch(() => "");
    throw new Error(`Convex ${path} failed (${res.status}): ${t}`);
  }
  return res.json();
}

export async function POST(request: Request) {
  try {
    // Defensive body parsing: React StrictMode + AbortController can deliver
    // an empty body when an in-flight request is aborted mid-mount. Treat that
    // as a benign 400 instead of crashing with JSON.parse SyntaxError.
    const raw = await request.text();
    if (!raw.trim()) {
      return NextResponse.json({ error: "empty request body" }, { status: 400 });
    }
    let body: {
      projectId: string;
      projectName: string;
      funderName?: string;
      format: string;
      reportType: ReportType;
      periodStart?: string;
      periodEnd?: string;
      userEmail: string;
      vibe?: string | null;
      generateNarrative?: boolean;
    };
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      return NextResponse.json(
        { error: "invalid JSON body", detail: String(parseErr) },
        { status: 400 },
      );
    }

    if (!body.projectId || !body.projectName || !body.userEmail) {
      return NextResponse.json({ error: "projectId, projectName, userEmail required" }, { status: 400 });
    }
    if (!isValidFormat(body.format)) {
      return NextResponse.json({ error: "format must be docx | pdf | pptx" }, { status: 400 });
    }
    if (body.reportType === "quarterly" && (!body.periodStart || !body.periodEnd)) {
      return NextResponse.json({ error: "Quarterly reports require periodStart and periodEnd" }, { status: 400 });
    }

    const slug = safeSlug(body.projectName);
    const today = new Date().toISOString().slice(0, 10);

    // Pre-fetch Convex data ─────────────────────────────────────────────
    let projectContext: Record<string, unknown>;
    try {
      projectContext = (await convexFetch("/ai/project-context", {
        projectId: body.projectId,
        userEmail: body.userEmail,
      })) as Record<string, unknown>;
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to load project context from Convex", detail: String(err) },
        { status: 500 },
      );
    }

    // Derive period dates
    let periodStart = body.periodStart ?? "";
    let periodEnd = body.periodEnd ?? today;
    if (body.reportType === "full") {
      const ctx = projectContext as { startDate?: string; recentActivities?: Array<{ activityDate?: string }> };
      periodStart = ctx?.startDate?.trim() || "";
      if (!periodStart) {
        const dates = (ctx?.recentActivities ?? [])
          .map((a) => a.activityDate)
          .filter((d): d is string => Boolean(d))
          .sort();
        periodStart = dates[0] ?? "2024-01-01";
      }
      periodEnd = today;
    }

    let reportData: Record<string, unknown>;
    try {
      reportData = (await convexFetch("/ai/report-data", {
        projectId: body.projectId,
        userEmail: body.userEmail,
        periodStart,
        periodEnd,
      })) as Record<string, unknown>;
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to load report data from Convex", detail: String(err) },
        { status: 500 },
      );
    }

    const periodTag =
      body.reportType === "full"
        ? "full"
        : `${periodStart.replace(/-/g, "")}-${periodEnd.replace(/-/g, "")}`;
    const filename = `${slug}_${periodTag}.${body.format}`;

    // ── Call DeerFlow non-agentic exec endpoint ──────────────────────────
    const upstream = await deerflowExecFetch("/api/exec/render-report", {
      method: "POST",
      body: JSON.stringify({
        format: body.format,
        report_type: body.reportType,
        project_id: body.projectId,
        project_name: body.projectName,
        filename,
        period_start: periodStart,
        period_end: periodEnd,
        vibe: body.vibe ?? null,
        data: { ...projectContext, ...reportData, funderName: body.funderName ?? null },
        generate_narrative: body.generateNarrative ?? true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      console.error("[generate-document] exec upstream failed:", upstream.status, text);
      return NextResponse.json(
        { error: "Render service failed", status: upstream.status, detail: text },
        { status: 502 },
      );
    }

    // ── Relay SSE, rewriting init.download_url to the Vercel proxy path ──
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();

    const transformed = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE events (terminated by \n\n).
            let idx: number;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const chunk = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);

              const rewritten = rewriteSseChunk(chunk, filename);
              controller.enqueue(encoder.encode(rewritten + "\n\n"));
            }
          }
          if (buffer.length) {
            const tail = rewriteSseChunk(buffer, filename);
            controller.enqueue(encoder.encode(tail));
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(transformed, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof DeerflowUnreachableError) {
      console.warn("[generate-document]", err.message);
      return NextResponse.json(
        { error: "DeerFlow service is not running", detail: err.message },
        { status: 503 },
      );
    }
    console.error("[generate-document] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * Rewrite the `download_url` field in `init` / `done` SSE events so the
 * browser hits our Vercel-side proxy (which forwards Bearer auth) rather
 * than DeerFlow directly.
 */
function rewriteSseChunk(chunk: string, filename: string): string {
  if (!chunk.includes("download_url")) return chunk;
  const lines = chunk.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("data: ")) continue;
    try {
      const obj = JSON.parse(line.slice(6)) as { download_url?: string; report_id?: string };
      if (obj.download_url && obj.report_id) {
        obj.download_url = `/api/ai/exec-artifact/${encodeURIComponent(obj.report_id)}/${encodeURIComponent(filename)}`;
        lines[i] = `data: ${JSON.stringify(obj)}`;
      }
    } catch {
      // not JSON, leave as-is
    }
  }
  return lines.join("\n");
}
