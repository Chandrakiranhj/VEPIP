import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const projectStatus = v.union(v.literal("on_track"), v.literal("at_risk"), v.literal("overdue"), v.literal("completed"));
const deliverableStatus = v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("completed"), v.literal("overdue"));
const approvalStatus = v.union(v.literal("draft"), v.literal("submitted"), v.literal("approved"), v.literal("rejected"));
const alertSeverity = v.union(v.literal("info"), v.literal("watch"), v.literal("critical"));
const userRole = v.union(
  v.literal("admin"),
  v.literal("leadership"),
  v.literal("program_manager"),
  v.literal("account_manager"),
  v.literal("finance"),
);

export default defineSchema({
  people: defineTable({
    name: v.string(),
    email: v.string(),
    role: userRole,
    authUserId: v.optional(v.string()),
    tempPassword: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_role", ["role"])
    .index("by_email", ["email"])
    .index("by_auth_user_id", ["authUserId"]),

  funders: defineTable({
    name: v.string(),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    reportingCadence: v.optional(v.string()),
  }).index("by_name", ["name"]),

  projects: defineTable({
    name: v.string(),
    funderId: v.optional(v.id("funders")),
    funderName: v.string(),
    programManagerId: v.optional(v.id("people")),
    accountManagerId: v.optional(v.id("people")),
    status: projectStatus,
    grantAmount: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    states: v.array(v.string()),
    // Optional per-state weighting of the project's grant (fractions sum to 1).
    // When absent, the project is split equally across `states[]`. Lets a
    // project that covers 3 states but commits 70% of budget to Karnataka
    // attribute correctly in statewise analytics.
    stateAllocations: v.optional(
      v.array(v.object({ state: v.string(), fraction: v.number() })),
    ),
    summary: v.optional(v.string()),
    funderLogoStorageId: v.optional(v.id("_storage")),
    proposalStorageId: v.optional(v.id("_storage")),
    mouStorageId: v.optional(v.id("_storage")),
    extractedDraft: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_funder", ["funderName"]),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    personId: v.id("people"),
    role: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_person", ["personId"])
    .index("by_project_person", ["projectId", "personId"]),

  deliverables: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    target: v.optional(v.number()),
    achieved: v.optional(v.number()),
    unit: v.optional(v.string()),
    dueDate: v.string(),
    status: deliverableStatus,
  })
    .index("by_project", ["projectId"])
    .index("by_due_date", ["dueDate"]),

  milestones: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    dueDate: v.string(),
    completedAt: v.optional(v.string()),
    status: deliverableStatus,
  })
    .index("by_project", ["projectId"])
    .index("by_due_date", ["dueDate"]),

  budgetCategories: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    approvedAmount: v.number(),
    spentAmount: v.number(),
  }).index("by_project", ["projectId"]),

  expenses: defineTable({
    projectId: v.id("projects"),
    categoryId: v.id("budgetCategories"),
    spentOn: v.string(),
    amount: v.number(),
    description: v.string(),
    paymentMode: v.optional(v.string()),
    receiptStorageId: v.optional(v.id("_storage")),
    status: approvalStatus,
    submittedBy: v.optional(v.id("people")),
    approvedBy: v.optional(v.id("people")),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  activities: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    activityDate: v.string(),
    state: v.optional(v.string()),
    location: v.optional(v.string()),
    teachersReached: v.optional(v.number()),
    studentsReached: v.optional(v.number()),
    schoolsReached: v.optional(v.number()),
    notes: v.optional(v.string()),
    testimonial: v.optional(v.string()),
    testimonialBy: v.optional(v.string()),
    evidenceStorageIds: v.optional(v.array(v.id("_storage"))),
  })
    .index("by_project", ["projectId"])
    .index("by_date", ["activityDate"]),

  reports: defineTable({
    projectId: v.id("projects"),
    periodStart: v.string(),
    periodEnd: v.string(),
    dueDate: v.string(),
    status: approvalStatus,
    reportType: v.optional(v.union(v.literal("quarterly"), v.literal("full"))),
    title: v.optional(v.string()),
    draft: v.optional(v.string()),
    generatedAt: v.optional(v.number()),
    documentStorageId: v.optional(v.id("_storage")),
  })
    .index("by_project", ["projectId"])
    .index("by_due_date", ["dueDate"]),

  alerts: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    severity: alertSeverity,
    ownerId: v.optional(v.id("people")),
    dueDate: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_severity", ["severity"]),

  testimonials: defineTable({
    projectId: v.id("projects"),
    content: v.string(),
    author: v.string(),
    role: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  gallery: defineTable({
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  states: defineTable({
    name: v.string(),
    code: v.string(),
  }).index("by_code", ["code"]),

  schools: defineTable({
    name: v.string(),
    stateId: v.id("states"),
    funderId: v.optional(v.id("funders")),
    address: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_state", ["stateId"])
    .index("by_funder", ["funderId"]),

  fundVisibility: defineTable({
    funderId: v.id("funders"),
    stateId: v.id("states"),
    fiscalYear: v.string(), // e.g., "2024-25"
    amount: v.number(),
    probability: v.number(), // 0 to 1
    type: v.union(v.literal("confirmed"), v.literal("pipeline")),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_state", ["stateId"])
    .index("by_fiscal_year", ["fiscalYear"]),

  // Multi-year state-level funding targets. One row per (stateId, fiscalYear).
  // Used by the Multi-Year Planning view to chart 5-7 years of state targets
  // against current project coverage.
  stateAnnualTargets: defineTable({
    stateId: v.id("states"),
    fiscalYear: v.string(),       // "26-27", "27-28", …
    targetAmount: v.number(),     // INR
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("people")),
    updatedAt: v.number(),
  })
    .index("by_state", ["stateId"])
    .index("by_fiscal_year", ["fiscalYear"])
    .index("by_state_year", ["stateId", "fiscalYear"]),

  fyExpenditure: defineTable({
    stateId: v.id("states"),
    fiscalYear: v.string(), // e.g., "24-25"
    plannedExpense: v.number(),
    actualSpent: v.number(),
    updatedAt: v.number(),
  })
    .index("by_state", ["stateId"])
    .index("by_fiscal_year", ["fiscalYear"]),

  // ── RAG / grounding (sub-project A) ─────────────────────────────────────────

  documents: defineTable({
    projectId: v.optional(v.id("projects")),
    kind: v.union(
      v.literal("project_summary"),
      v.literal("mou"),
      v.literal("proposal"),
      v.literal("report_draft"),
      v.literal("activity_note"),
      v.literal("testimonial"),
      v.literal("meeting_note"),
      v.literal("uploaded_pdf"),
    ),
    sourceTable: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    title: v.string(),
    text: v.string(),
    textHash: v.string(),
    createdAt: v.number(),
    indexedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_kind", ["kind"])
    .index("by_source", ["sourceTable", "sourceId"]),

  documentChunks: defineTable({
    documentId: v.id("documents"),
    projectId: v.optional(v.id("projects")),
    kind: v.string(),
    chunkIndex: v.number(),
    text: v.string(),
    embedding: v.array(v.float64()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_project", ["projectId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["projectId", "kind"],
    }),

  // ── Entity graph (sub-project B) ───────────────────────────────────────────

  entities: defineTable({
    kind: v.union(
      v.literal("funder"),
      v.literal("person"),
      v.literal("region"),
      v.literal("theme"),
      v.literal("school"),
    ),
    canonicalId: v.optional(v.string()),
    name: v.string(),
    aliases: v.array(v.string()),
    rollup: v.any(),
    updatedAt: v.number(),
  })
    .index("by_kind", ["kind"])
    .index("by_canonical", ["kind", "canonicalId"]),

  entityRelations: defineTable({
    fromKind: v.string(),
    fromId: v.id("entities"),
    toKind: v.string(),
    toId: v.id("entities"),
    via: v.string(),
    projectId: v.optional(v.id("projects")),
    weight: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_from", ["fromId", "via"])
    .index("by_to", ["toId", "via"])
    .index("by_project", ["projectId"]),

  entityFacts: defineTable({
    entityId: v.id("entities"),
    fact: v.string(),
    source: v.union(
      v.literal("user_confirmed"),
      v.literal("derived"),
      v.literal("agent_inferred"),
    ),
    confidence: v.number(),
    createdBy: v.optional(v.id("people")),
    createdAt: v.number(),
  }).index("by_entity", ["entityId"]),

  // ── Proactive autonomy (sub-project C) ─────────────────────────────────────

  aiSuggestions: defineTable({
    projectId: v.optional(v.id("projects")),
    kind: v.union(
      v.literal("report_draft"),
      v.literal("activity_prefill"),
      v.literal("expense_prefill"),
      v.literal("alert"),
      v.literal("digest"),
    ),
    title: v.string(),
    summary: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("dismissed"),
      v.literal("edited"),
    ),
    createdAt: v.number(),
    reviewedBy: v.optional(v.id("people")),
    reviewedAt: v.optional(v.number()),
    source: v.union(
      v.literal("scheduled"),
      v.literal("threshold"),
      v.literal("upload"),
    ),
    sourceRef: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_kind", ["kind"])
    .index("by_project_status", ["projectId", "status"]),

  proactiveEvents: defineTable({
    kind: v.string(),
    payload: v.any(),
    triggeredAt: v.number(),
    processedAt: v.optional(v.number()),
    resultSuggestionId: v.optional(v.id("aiSuggestions")),
  }).index("by_kind", ["kind"]),
});
