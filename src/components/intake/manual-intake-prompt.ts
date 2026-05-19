/**
 * The canonical prompt for manual intake. Always the same — users upload
 * their proposal / MOU / annexure / budget PDFs directly into Claude, ChatGPT,
 * or Gemini, paste this prompt, and bring the structured JSON back to VEPIP.
 *
 * Single source of truth for the contract. The Python intake SKILL.md mirrors
 * this; if you change one, update the other.
 */

export const MANUAL_INTAKE_PROMPT = `# Vision Empower — Grant Project Intake (Strict Mode)

You are extracting a structured project record from grant documents for **Vision Empower Trust**, an Indian non-profit that builds inclusive education for visually impaired children. The user has just uploaded one or more files into this chat (Proposal, MOU, Grant Agreement, Budget Annexure, Impact Sheet, School Mapping, Approval Letters — anything they have).

Your output goes directly into Vision Empower's project tracker as the single source of truth for what they have promised the funder. **Accuracy matters more than completeness.** Inventing or guessing a value will cause downstream financial, legal, and reporting failures.

═══════════════════════════════════════════════════════════════════════════
HARD RULES — READ BEFORE YOU START
═══════════════════════════════════════════════════════════════════════════

1. **Read every uploaded document end-to-end before responding.** Do not skim. Do not stop at the first page that mentions a number — the same figure may appear differently in the MOU vs the budget annexure.

2. **Never invent a value.** If a field is not in the documents, output \`null\` for scalars and \`[]\` for lists. Add an entry to \`risksOrAmbiguities\` describing what is missing and which document you would expect it in. The user prefers an honest gap to a hallucinated value.

3. **Cross-reference between documents.** If the proposal says ₹18L and the MOU says ₹17L, do NOT pick one. Use \`null\` (or the MOU value if it exists, since the MOU is the binding contract — but flag the mismatch in \`risksOrAmbiguities\`).

4. **Currency is INR.** Plain integers. No commas, no ₹, no decimal points. Expand:
   • 18L → 1800000
   • 1.5Cr → 15000000
   • 75,00,000 → 7500000

5. **Dates are ISO YYYY-MM-DD.**
   • "April 2024" → "2024-04-01"
   • "31st March 2025" → "2025-03-31"
   • "Q1 FY 2024-25" → periodStart "2024-04-01", periodEnd "2024-06-30" (Indian FY: April–March)

6. **Use canonical Indian state spellings**: Karnataka, Andhra Pradesh, Telangana, Tamil Nadu, Maharashtra, Gujarat, Rajasthan, Uttar Pradesh, Bihar, Odisha, Madhya Pradesh, West Bengal, Assam, Kerala, Jharkhand, Chhattisgarh, Delhi, Goa, Punjab, Haryana, Uttarakhand, Himachal Pradesh, Jammu and Kashmir, Ladakh, Meghalaya, Manipur, Mizoram, Nagaland, Sikkim, Tripura, Arunachal Pradesh.

7. **Deliverables = Vision Empower Commitments.** These are the quantified promises VE has made to the funder. Search for sections labelled "Vision Empower Commitments", "Project Deliverables", "Outputs", "Targets", "Outcomes", or any table where VE has signed up to a number (e.g. "450 teachers trained", "20,000 students reached", "8 schools covered"). Capture the number AND the qualitative description.

8. **Budget categories are coarse buckets.** Use these standardised names where possible: Human Resources, Equipment, Events / Training, Communications, Admin / Overhead, Travel, Materials. If the proposal only lists granular line items, group them into these buckets in \`budgetCategories\` AND keep the granular items in \`budgetLineItems\`.

9. **Phase linkage.** Multi-year MoUs (especially Bosch / Wipro / Cognizant grants) typically break into Phase 1.1, 1.2, 2.0, etc. When a deliverable, milestone, budget line, or KPI is tied to a specific phase, set its \`phaseCode\` to match an entry in \`phases[]\`. If unclear, omit \`phaseCode\` — don't guess.

10. **State allocations.** Populate \`stateAllocations\` ONLY when the documents give concrete per-state numbers (e.g. a budget table that breaks down ₹X for Karnataka and ₹Y for Telangana). If the documents only list operating states without per-state budgets, leave \`stateAllocations: []\` — the platform defaults to an equal split.

11. **No prose, no markdown headings, no follow-up questions.** Your entire reply must be exactly one fenced JSON block. The user's intake tool will reject anything that doesn't parse on first attempt.

═══════════════════════════════════════════════════════════════════════════
OUTPUT — return EXACTLY ONE JSON block in this shape
═══════════════════════════════════════════════════════════════════════════

\`\`\`json
{
  "projectName": "string",
  "summary": "3-5 sentence executive summary of what Vision Empower has committed to do. Mention beneficiary group, geography, and key outputs.",
  "internalShortCode": null,
  "themes": [],
  "newOrContinuation": null,

  "funder": { "name": "string", "contactName": null, "contactEmail": null },
  "grantAmount": null,
  "currency": "INR",
  "startDate": null,
  "endDate": null,
  "states": [],
  "stateAllocations": [],

  "documents": [
    {
      "kind": "mou",
      "name": "Bosch CSR MoU — KA-TG 2024-26",
      "version": null,
      "status": "signed",
      "issueDate": null,
      "effectiveDate": null,
      "expiryDate": null,
      "notes": null
    }
  ],

  "parties": [
    { "kind": "funder",             "name": "Bosch India Foundation", "role": null,                       "contactName": null, "contactEmail": null, "notes": null },
    { "kind": "implementer",        "name": "Vision Empower Trust",   "role": null,                       "contactName": null, "contactEmail": null, "notes": null },
    { "kind": "consortium_partner", "name": "CAGS",                    "role": "Research dissemination",   "contactName": null, "contactEmail": null, "notes": null },
    { "kind": "govt_department",    "name": "Karnataka SCERT",          "role": "State approving authority","contactName": null, "contactEmail": null, "notes": null }
  ],

  "phases": [
    { "code": "1.1", "name": "Resource Centre setup",       "description": null, "startDate": null, "endDate": null, "states": ["Karnataka"] },
    { "code": "1.2", "name": "Assistive tech deployment",    "description": null, "startDate": null, "endDate": null, "states": ["Karnataka"] },
    { "code": "2.0", "name": "Teacher training rollout",     "description": null, "startDate": null, "endDate": null, "states": ["Karnataka", "Telangana"] }
  ],

  "deliverables": [
    {
      "title": "Teachers trained",
      "description": "Block-resource teachers across 8 districts trained in inclusive pedagogy and assistive tech.",
      "target": 450,
      "unit": "Teachers",
      "dueDate": null,
      "phaseCode": "2.0"
    }
  ],

  "milestones": [
    { "title": "Mid-term review", "dueDate": null, "phaseCode": "1.2" }
  ],

  "budgetCategories": [
    { "name": "Human Resources",   "amount": 4500000 },
    { "name": "Equipment",          "amount": 3500000 },
    { "name": "Events / Training",  "amount": 2000000 },
    { "name": "Admin / Overhead",   "amount":  900000 }
  ],

  "budgetLineItems": [
    {
      "categoryName": "Human Resources",
      "phaseCode": "1.1",
      "state": "Karnataka",
      "name": "Project Lead",
      "description": null,
      "subCategory": "HR",
      "unitCost": 75000,
      "units": 1,
      "months": 12,
      "totalCost": 900000,
      "partnerContribution": 0,
      "inKindContribution": 0,
      "recurring": true,
      "notes": "On actuals subject to vendor evaluation"
    }
  ],

  "paymentTranches": [
    {
      "tranche": 1,
      "amount": 5400000,
      "plannedDate": null,
      "triggerCondition": "Signed agreement received and UC for prior FY submitted",
      "requiredDocs": ["Utilization certificate", "Audited statement"],
      "notes": null
    }
  ],

  "kpis": [
    {
      "kind": "output",
      "title": "Teachers trained",
      "unit": "teachers",
      "baseline": 0,
      "target": 450,
      "frequency": "quarterly",
      "dataSource": "Training attendance sheets",
      "collectionOwner": null,
      "reportingTemplate": "VE logframe",
      "notes": null
    },
    {
      "kind": "outcome",
      "title": "Improvement in classroom inclusion practices",
      "unit": null,
      "baseline": null,
      "target": null,
      "frequency": "annual",
      "dataSource": "Classroom observation rubric",
      "collectionOwner": null,
      "reportingTemplate": null,
      "notes": null
    }
  ],

  "compliance": [
    {
      "kind": "reporting",
      "title": "Quarterly progress reports",
      "text": "Submit on IT platform AND soft copy within 30 days of quarter end.",
      "frequency": "quarterly",
      "dueDate": null,
      "notes": null
    },
    {
      "kind": "ip_content",
      "title": "Content IP joint ownership",
      "text": "All converted accessible textbooks and content remain joint IP of funder and VE.",
      "frequency": null,
      "dueDate": null,
      "notes": null
    },
    {
      "kind": "visibility_branding",
      "title": "Logo and branding usage",
      "text": null,
      "frequency": null,
      "dueDate": null,
      "notes": null
    }
  ],

  "approvals": [
    { "state": "Karnataka", "department": "SCERT", "title": "Block-level rollout approval", "notes": null }
  ],

  "risks": [
    {
      "title": "Government approval delay",
      "severity": "high",
      "likelihood": null,
      "mitigation": "Begin advocacy 90 days before phase 2 start",
      "description": null
    }
  ],

  "reportingSchedule": [
    { "label": "Q1 Progress", "periodStart": "2025-04-01", "periodEnd": "2025-06-30", "dueDate": "2025-07-30" }
  ],

  "risksOrAmbiguities": [
    "MOU project end date not specified — derive from proposal once available",
    "Budget total in MOU (₹17L) differs from proposal total (₹18L) — funder confirmation needed",
    "School list referenced as Annexure A but the annexure was not attached",
    "No tranche conditions defined for the second instalment",
    "Audit rights clause uses ambiguous language — flag to legal team"
  ]
}
\`\`\`

═══════════════════════════════════════════════════════════════════════════
FIELD-BY-FIELD GUIDANCE
═══════════════════════════════════════════════════════════════════════════

**\`projectName\`** — Use the title from the proposal or MOU verbatim. If the documents have a longer title and a shorter "project code", put the long title here and the code in \`internalShortCode\`.

**\`themes\`** — Free string tags chosen from this vocabulary when applicable: \`inclusive_education\`, \`stem\`, \`computational_thinking\`, \`digital_literacy\`, \`braille\`, \`accessibility\`, \`teacher_training\`, \`assistive_tech\`, \`parent_engagement\`, \`community_outreach\`, \`livelihoods\`. Multiple themes per project is normal. Don't invent new themes — leave \`[]\` if none of these fit.

**\`newOrContinuation\`** — Look for language like "continuation of prior phase", "year 2 of the project", "renewal of the 2023 grant". Otherwise \`null\`.

**\`funder.name\`** — The LEGAL entity name (e.g. "Bosch India Foundation", not "Bosch"). Pull from the signature block of the MOU when possible.

**\`grantAmount\`** — The TOTAL committed grant in INR. Sum of all tranches. Should match \`sum(paymentTranches[].amount)\` and approximately \`sum(budgetCategories[].amount)\`. If they don't match, flag in \`risksOrAmbiguities\`.

**\`documents[]\`** — One entry PER document the user has uploaded into this chat. \`kind\` is one of: \`proposal\`, \`mou\`, \`grant_agreement\`, \`annexure\`, \`approval\`, \`budget\`, \`impact_sheet\`, \`other\`. \`status\` is one of: \`draft\`, \`under_review\`, \`signed\`, \`active\`, \`closed\`.

**\`parties[]\`** — Every named entity beyond just funder and VE. \`kind\` is one of: \`funder\`, \`implementer\`, \`consortium_partner\`, \`research_partner\`, \`content_partner\`, \`evaluator\`, \`outreach_partner\`, \`govt_department\`, \`signatory\`, \`other\`. Include CAGS / IIITB / state SCERTs / school networks if mentioned.

**\`phases[]\`** — Use the document's own phase codes (e.g. "1.1", "1.2", "2.0"). If the project is single-phase, leave \`[]\`. Each phase should have at least a \`code\` and a \`name\`.

**\`deliverables[]\`** — Quantified promises. Every deliverable should have a \`target\` (number) and a \`unit\` (Teachers / Students / Schools / Sessions / Books / Workshops / etc). If the documents promise something qualitative without a number ("foster a culture of inclusion"), capture it in \`kpis\` as an outcome indicator instead, not as a deliverable.

**\`budgetCategories[]\` AND \`budgetLineItems[]\`** — Both can be populated. Categories are the coarse summary (used by the funder dashboard). Line items are the granular HR roles, equipment SKUs, event line items (used by the finance team). If the proposal only gives line items, group them into categories yourself.

**\`paymentTranches[]\`** — Each disbursement. Common patterns: "30% upfront, 70% on final report", "tranche 1 on signing, tranche 2 after Q2 report". Capture \`triggerCondition\` verbatim from the MOU.

**\`kpis[]\`** — MEL framework. \`kind\` is \`output\` (countable VE activity) or \`outcome\` (change in beneficiary state). Pull from "logframe", "M&E", "indicator table", "KPI dashboard" sections.

**\`compliance[]\`** — Legal-operational obligations. \`kind\` is one of: \`reporting\`, \`audit\`, \`visibility_branding\`, \`ip_content\`, \`data_privacy\`, \`procurement\`, \`termination\`, \`amendment\`, \`indemnity\`, \`governing_law\`, \`other\`. Capture the clause TEXT (not a summary) when possible.

**\`approvals[]\`** — Government / regulatory approvals needed before implementation. Common in multi-state grants.

**\`risks[]\`** — Risks explicitly named in the documents OR obvious from the structure (e.g. dependency on a third party that isn't signed yet). \`severity\` is \`low\`, \`medium\`, or \`high\`. Don't invent — only what the documents actually say or what a reasonable program officer would flag.

**\`reportingSchedule[]\`** — Distinct from \`compliance[]\` — this is the calendar. If the MOU says "quarterly reports" and the project runs 2025-04-01 to 2027-03-31, derive 8 quarterly entries. If unstated, leave \`[]\` and add a note in \`risksOrAmbiguities\`.

**\`risksOrAmbiguities[]\`** — The most valuable field. Anything the documents don't fully resolve: missing dates, mismatched totals, referenced-but-not-attached annexures, unsigned signatures, ambiguous clause language, undefined acronyms. The program officer will work through this list as their first action after intake. Be thorough and specific.

═══════════════════════════════════════════════════════════════════════════
FINAL INSTRUCTION
═══════════════════════════════════════════════════════════════════════════

Read every uploaded document. Cross-reference values that appear in multiple places. Where you can't find a value, output \`null\` / \`[]\` and add to \`risksOrAmbiguities\`. Do not invent. Do not summarise away detail.

Now reply with EXACTLY ONE \`\`\`json block matching the schema above. Nothing before it. Nothing after it.
`;

/** For pages that want the prompt as a string. */
export function getManualIntakePrompt(): string {
  return MANUAL_INTAKE_PROMPT;
}
