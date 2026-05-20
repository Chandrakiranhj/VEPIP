import { Document, Packer, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";
import pptxgen from "pptxgenjs";

import { generateJson } from "@/lib/ai-direct";
import { fiscalYearForDate, fiscalYearLabel } from "@/lib/fiscal-year";
import { putReportArtifact } from "@/lib/report-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Format = "docx" | "pdf" | "pptx";
type ReportType = "quarterly" | "full";

interface ReportBody {
  projectId: string;
  projectName: string;
  funderName?: string;
  format: Format;
  reportType: ReportType;
  periodStart?: string;
  periodEnd?: string;
  userEmail: string;
  vibe?: string | null;
}

interface Narrative {
  overview: string;
  achievements: string;
  challenges: string;
  way_forward: string;
  executive_summary: string;
}

const CONVEX_SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
const INTERNAL_SECRET = process.env.VEPIP_INTERNAL_SECRET ?? "";

function sse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function safeSlug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "report";
}

function contentType(format: Format) {
  if (format === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (format === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/pdf";
}

async function convexFetch(path: string, payload: object): Promise<Record<string, unknown>> {
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
    throw new Error(`Convex ${path} failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function narrativePrompt(body: ReportBody, projectContext: Record<string, unknown>, reportData: Record<string, unknown>, fiscalYear: string | null) {
  return `Write a Vision Empower funder report narrative as JSON only.

Tone: clear, accountable, funder-ready, specific. Avoid generic marketing language.
Report type: ${body.reportType}
Fiscal year: ${fiscalYear ? fiscalYearLabel(fiscalYear) : "full project"}
Period: ${body.periodStart ?? "project start"} to ${body.periodEnd ?? "today"}
Project: ${body.projectName}
Funder: ${body.funderName ?? "Unknown"}

Return exactly:
{
  "executive_summary": "...",
  "overview": "...",
  "achievements": "...",
  "challenges": "...",
  "way_forward": "..."
}

Use only this live Convex data:
${JSON.stringify({ projectContext, reportData }).slice(0, 60000)}`;
}

function rowsFromData(projectContext: Record<string, unknown>, reportData: Record<string, unknown>) {
  const project = (reportData.project ?? projectContext) as Record<string, unknown>;
  const activities = (reportData.activities ?? []) as Array<Record<string, unknown>>;
  const deliverables = (reportData.deliverables ?? projectContext.deliverables ?? []) as Array<Record<string, unknown>>;
  const budgets = (reportData.budgets ?? projectContext.budgetCategories ?? []) as Array<Record<string, unknown>>;
  const expenses = (reportData.expenses ?? []) as Array<Record<string, unknown>>;
  return { project, activities, deliverables, budgets, expenses };
}

function lineItems(narrative: Narrative) {
  return [
    ["Executive Summary", narrative.executive_summary],
    ["Overview", narrative.overview],
    ["Achievements", narrative.achievements],
    ["Challenges", narrative.challenges],
    ["Way Forward", narrative.way_forward],
  ] as const;
}

async function renderDocx(body: ReportBody, narrative: Narrative, projectContext: Record<string, unknown>, reportData: Record<string, unknown>) {
  const { activities, deliverables, budgets } = rowsFromData(projectContext, reportData);
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: body.projectName, bold: true, size: 34 })] }),
          new Paragraph(`${body.funderName ?? ""} | ${body.reportType === "full" ? "Full Project Report" : "FY/period report"}`),
          ...lineItems(narrative).flatMap(([heading, text]) => [
            new Paragraph({ children: [new TextRun({ text: heading, bold: true, size: 26 })] }),
            new Paragraph(text),
          ]),
          new Paragraph({ children: [new TextRun({ text: "Snapshot", bold: true, size: 26 })] }),
          new Paragraph(`Activities: ${activities.length}`),
          new Paragraph(`Deliverables: ${deliverables.length}`),
          new Paragraph(`Budget categories: ${budgets.length}`),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

async function renderPptx(body: ReportBody, narrative: Narrative, projectContext: Record<string, unknown>, reportData: Record<string, unknown>) {
  const { activities, deliverables, budgets } = rowsFromData(projectContext, reportData);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Vision Empower";
  pptx.subject = body.projectName;
  pptx.title = `${body.projectName} Report`;
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };
  const accent = body.vibe === "dark-premium" ? "D4A537" : "0F766E";
  const dark = body.vibe === "dark-premium" ? "111827" : "1F2937";

  let slide = pptx.addSlide();
  slide.background = { color: dark };
  slide.addText("Vision Empower", { x: 0.6, y: 0.45, w: 5, h: 0.3, fontSize: 12, color: accent, bold: true });
  slide.addText(body.projectName, { x: 0.6, y: 1.7, w: 8.5, h: 1.1, fontSize: 34, color: "FFFFFF", bold: true, breakLine: false });
  slide.addText(body.funderName ?? "", { x: 0.6, y: 2.9, w: 7, h: 0.3, fontSize: 13, color: "E5E7EB" });
  slide.addText(narrative.executive_summary, { x: 0.6, y: 4.3, w: 11.3, h: 1.1, fontSize: 16, color: "FFFFFF", fit: "shrink" });

  slide = pptx.addSlide();
  slide.addText("Impact Snapshot", { x: 0.5, y: 0.35, w: 5, h: 0.5, fontSize: 24, bold: true, color: dark });
  [
    ["Activities", activities.length],
    ["Deliverables", deliverables.length],
    ["Budget lines", budgets.length],
  ].forEach(([label, value], i) => {
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.7 + i * 4, y: 1.4, w: 3.3, h: 1.6, fill: { color: "F8FAFC" }, line: { color: "CBD5E1" } });
    slide.addText(String(value), { x: 1 + i * 4, y: 1.7, w: 2.7, h: 0.5, fontSize: 28, bold: true, color: accent, align: "center" });
    slide.addText(String(label), { x: 1 + i * 4, y: 2.25, w: 2.7, h: 0.3, fontSize: 11, color: dark, align: "center", bold: true });
  });
  slide.addText(narrative.achievements, { x: 0.7, y: 3.6, w: 5.8, h: 2.3, fontSize: 15, color: dark, fit: "shrink" });
  slide.addText(narrative.way_forward, { x: 6.8, y: 3.6, w: 5.5, h: 2.3, fontSize: 15, color: dark, fit: "shrink" });

  return new Uint8Array(await pptx.write({ outputType: "nodebuffer" }) as Buffer);
}

function renderPdf(body: ReportBody, narrative: Narrative, projectContext: Record<string, unknown>, reportData: Record<string, unknown>) {
  const { activities, deliverables, budgets, expenses } = rowsFromData(projectContext, reportData);
  return new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);

    doc.fontSize(10).fillColor("#0f766e").text("VISION EMPOWER", { characterSpacing: 1.5 });
    doc.moveDown(0.8);
    doc.fontSize(26).fillColor("#111827").text(body.projectName, { lineGap: 2 });
    doc.fontSize(11).fillColor("#6b7280").text(`${body.funderName ?? ""} | ${body.reportType === "full" ? "Full Project Report" : `${body.periodStart} to ${body.periodEnd}`}`);
    doc.moveDown();
    doc.fontSize(12).fillColor("#111827").text(narrative.executive_summary, { lineGap: 4 });
    doc.moveDown();
    doc.fontSize(13).fillColor("#111827").text("Snapshot", { underline: true });
    doc.fontSize(11).text(`Activities: ${activities.length}    Deliverables: ${deliverables.length}    Budget categories: ${budgets.length}    Expenses: ${expenses.length}`);
    doc.moveDown();

    for (const [heading, text] of lineItems(narrative)) {
      doc.moveDown(0.5);
      doc.fontSize(15).fillColor("#111827").text(heading);
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor("#374151").text(text, { lineGap: 4 });
    }
    doc.end();
  });
}

async function renderReport(body: ReportBody, narrative: Narrative, projectContext: Record<string, unknown>, reportData: Record<string, unknown>) {
  if (body.format === "docx") return renderDocx(body, narrative, projectContext, reportData);
  if (body.format === "pptx") return renderPptx(body, narrative, projectContext, reportData);
  return renderPdf(body, narrative, projectContext, reportData);
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const raw = await request.text();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => controller.enqueue(encoder.encode(sse(event, data)));
      try {
        if (!raw.trim()) throw new Error("empty request body");
        const body = JSON.parse(raw) as ReportBody;
        if (!body.projectId || !body.projectName || !body.userEmail) {
          throw new Error("projectId, projectName, and userEmail are required");
        }

        const reportId = crypto.randomUUID().replace(/-/g, "");
        const today = new Date().toISOString().slice(0, 10);
        let periodStart = body.periodStart ?? "";
        let periodEnd = body.periodEnd ?? today;
        const fiscalYear = body.reportType === "quarterly" ? fiscalYearForDate(periodEnd) : null;
        const slug = safeSlug(body.projectName);
        const periodTag = body.reportType === "full" ? "full" : `${periodStart.replace(/-/g, "")}-${periodEnd.replace(/-/g, "")}`;
        const filename = `${slug}_${periodTag}.${body.format}`;

        send("init", { report_id: reportId, filename, download_url: `/api/ai/exec-artifact/${reportId}/${filename}` });
        send("render-log", { line: "Loading project context from Convex" });

        const projectContext = await convexFetch("/ai/project-context", { projectId: body.projectId, userEmail: body.userEmail });
        if (body.reportType === "full") {
          periodStart = String(projectContext.startDate ?? "") || "2024-01-01";
          periodEnd = today;
        }
        const reportData = await convexFetch("/ai/report-data", { projectId: body.projectId, userEmail: body.userEmail, periodStart, periodEnd });

        send("narrative-start", {});
        const narrative = await generateJson<Narrative>(narrativePrompt({ ...body, periodStart, periodEnd }, projectContext, reportData, fiscalYear));
        send("narrative", { text: Object.values(narrative).join("\n\n"), blocks: narrative });

        send("render-start", {});
        send("render-log", { line: `Rendering ${body.format.toUpperCase()} directly in VEPIP` });
        const bytes = await renderReport({ ...body, periodStart, periodEnd }, narrative, projectContext, reportData);
        putReportArtifact(reportId, { bytes, filename, contentType: contentType(body.format) });
        send("render-complete", { bytes: bytes.byteLength });
        send("done", { report_id: reportId, filename, download_url: `/api/ai/exec-artifact/${reportId}/${filename}` });
      } catch (err) {
        console.error("[generate-document] direct render failed:", err);
        send("error", { message: err instanceof Error ? err.message : String(err) });
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
}
