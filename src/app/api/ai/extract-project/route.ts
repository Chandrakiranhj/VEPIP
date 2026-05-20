import { NextResponse } from "next/server";

import { generateJson } from "@/lib/ai-direct";
import { enumerateFiscalYears, fiscalYearForDate, prorateAmountByFiscalYear } from "@/lib/fiscal-year";
import { extractPdfDocument } from "@/lib/pdf-extraction";

export const runtime = "nodejs";
export const maxDuration = 300;

interface IntakeDraft {
  projectName?: string;
  summary?: string;
  funder?: { name?: string; contactName?: string | null; contactEmail?: string | null };
  funderName?: string;
  grantAmount?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  states?: string[];
  stateAllocations?: Array<{ state: string; fraction: number }>;
  deliverables?: Array<Record<string, unknown>>;
  milestones?: Array<Record<string, unknown>>;
  budgetCategories?: Array<Record<string, unknown>>;
  budgetLineItems?: Array<Record<string, unknown>>;
  reportingSchedule?: Array<Record<string, unknown>>;
  fiscalYears?: unknown;
  fyBudgetAllocations?: unknown;
  risksOrAmbiguities?: string[];
  [key: string]: unknown;
}

function cleanAndTruncate(text: string, maxChars = 1_200_000): string {
  const cleaned = text.replace(/[\r\n]{3,}/g, "\n\n").replace(/[ \t]{3,}/g, " ").trim();
  return cleaned.length <= maxChars ? cleaned : cleaned.slice(0, maxChars);
}

async function extractTextFromFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    const extracted = await extractPdfDocument(buffer);
    return cleanAndTruncate(
      [`PDF extraction mode: ${extracted.usedOcr ? "native text + OCR fallback" : "native text + layout elements"}`, extracted.text].join("\n\n"),
    );
  }
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return cleanAndTruncate(result.value ?? "");
  }
  return cleanAndTruncate(buffer.toString("utf-8"));
}

function withFiscalMapping(draft: IntakeDraft): IntakeDraft {
  const startDate = draft.startDate || null;
  const endDate = draft.endDate || null;
  const grantAmount = Number(draft.grantAmount ?? 0);
  const fiscalYears = enumerateFiscalYears(startDate, endDate);
  const fyBudgetAllocations = prorateAmountByFiscalYear(grantAmount, startDate, endDate);

  const addFy = <T extends Record<string, unknown>>(rows: T[] | undefined, dateKeys: string[]) =>
    (rows ?? []).map((row) => {
      const date = dateKeys.map((key) => row[key]).find((value): value is string => typeof value === "string" && value.length > 0);
      return date ? { ...row, fiscalYear: fiscalYearForDate(date) } : row;
    });

  return {
    ...draft,
    fiscalYears,
    fyBudgetAllocations,
    deliverables: addFy(draft.deliverables, ["dueDate"]),
    milestones: addFy(draft.milestones, ["dueDate"]),
    reportingSchedule: addFy(draft.reportingSchedule, ["periodEnd", "dueDate"]),
    budgetLineItems: addFy(draft.budgetLineItems, ["plannedDate", "dueDate"]),
  };
}

function intakePrompt(proposalText: string, mouText: string, today: string) {
  return `You are extracting project data for Vision Empower's Project Intelligence Platform.

Return ONLY valid JSON. Do not wrap in markdown.

Critical fiscal-year rule:
- Vision Empower uses Indian FY windows: FY 26-27 means 2026-04-01 through 2027-03-31.
- If a project spans multiple FYs, split timelines and budget visibility by FY.
- For any deliverable, milestone, report, budget line, tranche, or compliance date, include fiscalYear when a date is known.
- Include fiscalYears[] with { fiscalYear, label, startDate, endDate } for every FY touched by the project.
- Include fyBudgetAllocations[] with { fiscalYear, label, startDate, endDate, amount, fraction, days } using date prorating when the document does not provide explicit FY amounts.

Accuracy rules:
- Do not invent facts. Use null or [] and add a risksOrAmbiguities item when missing.
- Preserve funder language where useful.
- Dates must be YYYY-MM-DD.
- Amounts must be INR numbers when possible.

Required JSON shape:
{
  "projectName": string,
  "summary": string,
  "funder": { "name": string, "contactName": string|null, "contactEmail": string|null },
  "grantAmount": number|null,
  "startDate": "YYYY-MM-DD"|null,
  "endDate": "YYYY-MM-DD"|null,
  "states": string[],
  "stateAllocations": [{ "state": string, "fraction": number }],
  "fiscalYears": [{ "fiscalYear": "26-27", "label": "FY 2026-27", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }],
  "fyBudgetAllocations": [{ "fiscalYear": "26-27", "label": "FY 2026-27", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "amount": number, "fraction": number, "days": number }],
  "deliverables": [{ "title": string, "description": string|null, "target": number|null, "unit": string|null, "dueDate": "YYYY-MM-DD"|null, "fiscalYear": string|null, "phaseCode": string|null }],
  "milestones": [{ "title": string, "dueDate": "YYYY-MM-DD"|null, "fiscalYear": string|null, "phaseCode": string|null }],
  "budgetCategories": [{ "name": string, "amount": number|null }],
  "budgetLineItems": [{ "name": string, "categoryName": string|null, "state": string|null, "totalCost": number, "fiscalYear": string|null, "notes": string|null }],
  "paymentTranches": [{ "tranche": number, "amount": number, "plannedDate": "YYYY-MM-DD"|null, "fiscalYear": string|null, "triggerCondition": string|null }],
  "reportingSchedule": [{ "label": string, "periodStart": "YYYY-MM-DD"|null, "periodEnd": "YYYY-MM-DD"|null, "dueDate": "YYYY-MM-DD"|null, "fiscalYear": string|null }],
  "risksOrAmbiguities": string[],
  "documents": [],
  "parties": [],
  "phases": [],
  "kpis": [],
  "compliance": [],
  "approvals": [],
  "risks": []
}

today: ${today}

--- PROPOSAL TEXT ---
${proposalText || "(no proposal supplied)"}

--- MOU / AGREEMENT TEXT ---
${mouText || "(no MOU supplied)"}`;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let proposalText = "";
    let mouText = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const proposalFile = formData.get("proposal");
      const mouFile = formData.get("mou");
      if (proposalFile instanceof File) proposalText = await extractTextFromFile(proposalFile);
      if (mouFile instanceof File) mouText = await extractTextFromFile(mouFile);
      if (!proposalText) proposalText = String(formData.get("proposalText") ?? "");
      if (!mouText) mouText = String(formData.get("mouText") ?? "");
    } else {
      const body = await request.json();
      proposalText = String(body.proposalText ?? "");
      mouText = String(body.mouText ?? "");
    }

    if (!proposalText && !mouText) {
      return NextResponse.json({ error: "Please upload at least one document." }, { status: 400 });
    }

    const totalLen = proposalText.length + mouText.length;
    if (totalLen > 1_200_000) {
      if (proposalText && mouText) {
        proposalText = cleanAndTruncate(proposalText, 600_000);
        mouText = cleanAndTruncate(mouText, 600_000);
      } else if (proposalText) proposalText = cleanAndTruncate(proposalText, 1_200_000);
      else mouText = cleanAndTruncate(mouText, 1_200_000);
    }

    const today = new Date().toISOString().slice(0, 10);
    const draft = await generateJson<IntakeDraft>(intakePrompt(proposalText, mouText, today));
    return NextResponse.json({ draft: withFiscalMapping(draft) });
  } catch (error) {
    console.error("[AI Intake] direct extraction failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to extract project draft" },
      { status: 500 },
    );
  }
}
