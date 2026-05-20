import { getReportArtifact } from "@/lib/report-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_ID_RE = /^[a-f0-9]{32}$/;
const FILENAME_RE = /^[A-Za-z0-9_.-]+\.(pptx|docx|pdf)$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string; filename: string }> },
) {
  const { reportId, filename } = await context.params;
  if (!REPORT_ID_RE.test(reportId)) return new Response("invalid reportId", { status: 400 });
  if (!FILENAME_RE.test(filename)) return new Response("invalid filename", { status: 400 });

  const artifact = getReportArtifact(reportId);
  if (!artifact) return new Response("Report artifact expired. Please regenerate the report.", { status: 404 });

  return new Response(Buffer.from(artifact.bytes), {
    headers: {
      "content-type": artifact.contentType,
      "content-length": String(artifact.bytes.byteLength),
      "content-disposition": `attachment; filename="${artifact.filename}"`,
      "cache-control": "no-store",
    },
  });
}
