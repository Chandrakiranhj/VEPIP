/**
 * Builds the prompt the user pastes into ChatGPT / Claude / Gemini for the
 * manual intake flow. The prompt is self-contained — it ships the full JSON
 * schema VEPIP expects, the documents' text, and strict output rules — so the
 * user can run extraction in any LLM without DeerFlow being involved.
 *
 * Single source of truth for the contract lives in
 * `deer-flow/skills/custom/vepip-intake/SKILL.md`. We mirror the rules here
 * because the LLM the user uses won't have access to that file.
 */

export function buildManualIntakePrompt(args: {
  proposalText: string;
  mouText: string;
  today?: string;
}): string {
  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const proposal = args.proposalText.trim() || "(no proposal supplied)";
  const mou = args.mouText.trim() || "(no MOU supplied)";

  return `# VEPIP Project Intake Extraction

You are extracting a structured project plan from a grant Proposal and MOU.
Today is **${today}**. Currency is INR (₹). Dates are YYYY-MM-DD.

## Output rules (READ FIRST — these are hard rules)

1. Reply with **exactly one** fenced \`\`\`json block, and **nothing else** outside it. No greeting, no markdown headings, no follow-up questions.
2. Use \`null\` for missing scalar fields. Use \`[]\` for missing list fields. **Never invent values.**
3. Currency: plain numbers, no commas or symbols. Expand Lakhs/Crores: 18L → 1800000, 1.5Cr → 15000000.
4. Dates: ISO format YYYY-MM-DD. Convert "April 2024" → "2024-04-01", "March 31, 2025" → "2025-03-31".
5. **Deliverables = Vision Empower Commitments.** Search for sections labelled "Vision Empower Commitments", "Project Deliverables", "Outputs", "Targets". Capture the quantitative target AND the qualitative description.
6. **Budget categories are coarse buckets**: Human Resources, Equipment, Events / Training, Communications, Admin, Travel, Materials.
7. **Cross-document reconciliation**: if proposal and MOU disagree on a value, do NOT pick one silently — add to \`risksOrAmbiguities\`.
8. **Phase linkage**: when a deliverable, milestone, or budget line is tied to a phase from \`phases[]\`, set its \`phaseCode\` to the matching phase code. Omit \`phaseCode\` when unclear.
9. **State allocations**: populate \`stateAllocations\` only when the documents give concrete per-state numbers. Otherwise leave \`[]\` — the platform defaults to equal split.

## JSON schema

Return an object with exactly these top-level keys. Every list field is optional — leave \`[]\` when the documents say nothing about it.

\`\`\`jsonc
{
  "projectName":  "string",
  "summary":      "3-5 sentences describing what VE has committed to do",
  "internalShortCode": null,                            // e.g. "BSCH-KA-TG-2024"
  "themes":       [],                                   // ["inclusive_education", "stem", ...]
  "newOrContinuation": null,                            // "new" | "continuation" | "renewal" | null

  "funder":       { "name": "string", "contactName": null, "contactEmail": null },
  "grantAmount":  null,                                  // INR plain number
  "currency":     "INR",
  "startDate":    null,                                  // YYYY-MM-DD
  "endDate":      null,
  "states":       [],                                    // ["Karnataka", "Telangana"]
  "stateAllocations": [],                                // [{ "state": "Karnataka", "fraction": 0.6 }]

  "documents": [
    // { "kind": "mou"|"proposal"|"grant_agreement"|"annexure"|"approval"|"budget"|"impact_sheet"|"other",
    //   "name": "Bosch CSR MoU — KA-TG", "version": "v3",
    //   "status": "draft"|"under_review"|"signed"|"active"|"closed",
    //   "issueDate": null, "effectiveDate": null, "expiryDate": null, "notes": null }
  ],

  "parties": [
    // { "kind": "funder"|"implementer"|"consortium_partner"|"research_partner"|"content_partner"
    //         |"evaluator"|"outreach_partner"|"govt_department"|"signatory"|"other",
    //   "name": "CAGS", "role": "Research dissemination",
    //   "contactName": null, "contactEmail": null, "notes": null }
  ],

  "phases": [
    // { "code": "1.1", "name": "Resource Centre setup", "description": null,
    //   "startDate": null, "endDate": null, "states": [] }
  ],

  "deliverables": [
    // { "title": "Teachers trained", "description": "...", "target": 450,
    //   "unit": "Teachers", "dueDate": null, "phaseCode": "2.0" }
  ],

  "milestones": [
    // { "title": "Mid-term review", "dueDate": null, "phaseCode": "1.2" }
  ],

  "budgetCategories": [
    // { "name": "Human Resources", "amount": 4500000 }
  ],

  "budgetLineItems": [
    // { "categoryName": "Human Resources", "phaseCode": "1.1", "state": "Karnataka",
    //   "name": "Project Lead", "subCategory": "HR",
    //   "unitCost": 75000, "units": 1, "months": 12, "totalCost": 900000,
    //   "partnerContribution": 0, "inKindContribution": 0,
    //   "recurring": true, "notes": "On actuals subject to vendor evaluation" }
  ],

  "paymentTranches": [
    // { "tranche": 1, "amount": 5400000, "plannedDate": "2025-04-15",
    //   "triggerCondition": "Signed agreement received",
    //   "requiredDocs": ["Utilization certificate from prior year"],
    //   "notes": null }
  ],

  "kpis": [
    // { "kind": "output"|"outcome", "title": "Teachers trained", "unit": "teachers",
    //   "baseline": 0, "target": 450, "frequency": "quarterly",
    //   "dataSource": "Training attendance sheets",
    //   "reportingTemplate": "VE logframe", "collectionOwner": null, "notes": null }
  ],

  "compliance": [
    // { "kind": "reporting"|"audit"|"visibility_branding"|"ip_content"|"data_privacy"
    //         |"procurement"|"termination"|"amendment"|"indemnity"|"governing_law"|"other",
    //   "title": "Quarterly progress reports",
    //   "text": "Submit on IT platform AND soft copy within 30 days of quarter end",
    //   "frequency": "quarterly", "dueDate": null, "notes": null }
  ],

  "approvals": [
    // { "state": "Karnataka", "department": "SCERT",
    //   "title": "Block-level rollout approval", "notes": null }
  ],

  "risks": [
    // { "title": "Government approval delay", "severity": "high",
    //   "likelihood": null, "mitigation": "Begin advocacy 90 days before phase 2 start",
    //   "description": null }
  ],

  "reportingSchedule": [
    // { "label": "Q1 Progress", "periodStart": "2025-04-01", "periodEnd": "2025-06-30", "dueDate": "2025-07-30" }
  ],

  "risksOrAmbiguities": [
    // "End date not specified in either document",
    // "Budget totals listed in MOU (₹17L) don't match Proposal (₹18L)"
  ]
}
\`\`\`

## Documents

--- PROPOSAL TEXT ---
${proposal}

--- MOU / AGREEMENT TEXT ---
${mou}

## Final instruction

Read both documents carefully. Cross-reference values that appear in both (grant amount, dates, beneficiary counts, state lists). When you encounter a value in only one document, use it. When values disagree, do NOT pick — add an entry to \`risksOrAmbiguities\` describing the mismatch.

Reply with the single fenced \`\`\`json block. Nothing before. Nothing after.`;
}
