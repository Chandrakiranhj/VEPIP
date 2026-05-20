/**
 * Canonical prompt for manual intake.
 *
 * Users upload proposal / MOU / annexure / budget PDFs directly into their
 * preferred model, paste this prompt, and bring the structured JSON back to
 * VEPIP. The app validates and adds fiscal-year mapping again before save.
 */

export const MANUAL_INTAKE_PROMPT = `# Vision Empower Grant Project Intake

You are extracting a structured project record from grant documents for Vision Empower Trust, an Indian non-profit working in inclusive education for visually impaired children.

Return exactly one fenced json block. Do not add prose before or after it.

Hard rules:
1. Read every uploaded document before responding.
2. Never invent values. Use null for unknown scalars and [] for unknown lists.
3. Add missing, conflicting, or ambiguous details to risksOrAmbiguities.
4. Currency is INR as plain numbers. Examples: 18L = 1800000, 1.5Cr = 15000000, 75,00,000 = 7500000.
5. Dates must be ISO YYYY-MM-DD.
6. Vision Empower uses Indian fiscal years. FY 26-27 means 2026-04-01 through 2027-03-31.
7. If a project spans multiple FYs, map timelines and budgets to each FY.
8. For every deliverable, milestone, report, budget line, payment tranche, KPI, compliance item, or approval with a known date, include fiscalYear.
9. Include fiscalYears[] for every FY touched by the project.
10. Include fyBudgetAllocations[] with prorated amounts by days when the documents do not give explicit FY amounts.
11. Use canonical Indian state names.
12. Capture funder commitments, reporting obligations, tranches, budgets, risks, parties, phases, KPIs, and approvals when present.

Required JSON shape:

\`\`\`json
{
  "projectName": "string",
  "summary": "3-5 sentence executive summary",
  "internalShortCode": null,
  "themes": [],
  "newOrContinuation": null,
  "funder": { "name": "string", "contactName": null, "contactEmail": null },
  "grantAmount": null,
  "currency": "INR",
  "startDate": null,
  "endDate": null,
  "states": [],
  "stateAllocations": [
    { "state": "Karnataka", "fraction": 0.7 }
  ],
  "fiscalYears": [
    { "fiscalYear": "26-27", "label": "FY 2026-27", "startDate": "2026-04-01", "endDate": "2027-03-31" }
  ],
  "fyBudgetAllocations": [
    { "fiscalYear": "26-27", "label": "FY 2026-27", "startDate": "2026-04-01", "endDate": "2027-03-31", "amount": 0, "fraction": 0, "days": 0 }
  ],
  "documents": [
    { "kind": "mou", "name": "Document name", "version": null, "status": "signed", "issueDate": null, "effectiveDate": null, "expiryDate": null, "notes": null }
  ],
  "parties": [
    { "kind": "funder", "name": "Funder legal name", "role": null, "contactName": null, "contactEmail": null, "notes": null }
  ],
  "phases": [
    { "code": "1.1", "name": "Phase name", "description": null, "startDate": null, "endDate": null, "states": [] }
  ],
  "deliverables": [
    { "title": "Teachers trained", "description": null, "target": 450, "unit": "Teachers", "dueDate": null, "fiscalYear": null, "phaseCode": null }
  ],
  "milestones": [
    { "title": "Mid-term review", "dueDate": null, "fiscalYear": null, "phaseCode": null }
  ],
  "budgetCategories": [
    { "name": "Human Resources", "amount": 0 }
  ],
  "budgetLineItems": [
    { "categoryName": "Human Resources", "phaseCode": null, "state": null, "name": "Line item", "description": null, "subCategory": null, "unitCost": null, "units": null, "months": null, "totalCost": 0, "partnerContribution": 0, "inKindContribution": 0, "recurring": false, "plannedDate": null, "dueDate": null, "fiscalYear": null, "notes": null }
  ],
  "paymentTranches": [
    { "tranche": 1, "amount": 0, "plannedDate": null, "fiscalYear": null, "triggerCondition": null, "requiredDocs": [], "notes": null }
  ],
  "kpis": [
    { "kind": "output", "title": "Teachers trained", "unit": "teachers", "baseline": null, "target": 450, "frequency": "quarterly", "dataSource": null, "collectionOwner": null, "reportingTemplate": null, "notes": null }
  ],
  "compliance": [
    { "kind": "reporting", "title": "Quarterly progress reports", "text": null, "frequency": "quarterly", "dueDate": null, "fiscalYear": null, "notes": null }
  ],
  "approvals": [
    { "state": "Karnataka", "department": "SCERT", "title": "Approval title", "dueDate": null, "fiscalYear": null, "notes": null }
  ],
  "risks": [
    { "title": "Risk title", "severity": "medium", "likelihood": null, "mitigation": null, "description": null }
  ],
  "reportingSchedule": [
    { "label": "Q1 Progress", "periodStart": "2026-04-01", "periodEnd": "2026-06-30", "dueDate": "2026-07-30", "fiscalYear": "26-27" }
  ],
  "risksOrAmbiguities": []
}
\`\`\`

Field guidance:
- projectName: use the title from the proposal or MOU.
- grantAmount: total committed grant in INR. If proposal and MOU disagree, use the binding agreement if clear and flag the mismatch.
- stateAllocations: only populate when documents provide concrete per-state budget or scope weights. Otherwise [].
- deliverables: quantified Vision Empower promises to the funder.
- budgetCategories: coarse buckets such as Human Resources, Equipment, Events / Training, Communications, Admin / Overhead, Travel, Materials.
- budgetLineItems: granular finance lines when available.
- paymentTranches: each disbursement and trigger condition.
- reportingSchedule: derive quarterly entries when cadence and project dates are clear.
- risksOrAmbiguities: be thorough and specific.

Now reply with exactly one fenced json block matching the schema above.`;

export function getManualIntakePrompt(): string {
  return MANUAL_INTAKE_PROMPT;
}
