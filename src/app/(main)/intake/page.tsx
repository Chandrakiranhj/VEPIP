"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { buildManualIntakePrompt } from "@/components/intake/manual-intake-prompt";

// ─── Types ────────────────────────────────────────────────────────────────────

type AiStage = "upload" | "extracting" | "review" | "saving" | "done";
type ManualStage = "files" | "prompt" | "paste" | "review" | "saving" | "done";

interface Deliverable {
  title: string;
  description?: string | null;
  target?: number | null;
  unit?: string | null;
  dueDate?: string | null;
  phaseCode?: string | null;
}
interface Milestone { title: string; dueDate?: string | null; phaseCode?: string | null; }
interface BudgetCategory { name: string; amount: number | null; }
interface ReportSchedule { label: string; periodStart?: string | null; periodEnd?: string | null; dueDate?: string | null; }

interface Draft {
  projectName: string;
  summary: string;
  funder: { name: string; contactName: string | null; contactEmail: string | null };
  grantAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  states: string[];
  stateAllocations?: Array<{ state: string; fraction: number }>;
  deliverables: Deliverable[];
  milestones: Milestone[];
  budgetCategories: BudgetCategory[];
  reportingSchedule: ReportSchedule[];
  risksOrAmbiguities: string[];
  // Optional rich-structure fields. Present only when the LLM extracted them.
  documents?: unknown[];
  parties?: unknown[];
  phases?: unknown[];
  budgetLineItems?: unknown[];
  paymentTranches?: unknown[];
  kpis?: unknown[];
  compliance?: unknown[];
  approvals?: unknown[];
  risks?: unknown[];
  [key: string]: unknown;
}

// ─── File drop zone (shared) ──────────────────────────────────────────────────

function FileDropZone({
  label,
  hint,
  file,
  onFile,
  onClear,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all cursor-pointer",
        dragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : file
            ? "border-emerald-500/60 bg-emerald-500/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.docx"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />

      {file ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <FileText className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="font-medium text-sm">{file.name}</div>
              <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            <X className="size-3.5" />
          </Button>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs">
            ✓ Ready
          </Badge>
        </>
      ) : (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UploadCloud className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium text-sm">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
            <p className="text-xs text-muted-foreground mt-2">Drag &amp; drop or click to browse</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">PDF, DOCX, or TXT</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Draft Review (used by both modes) ────────────────────────────────────────

function DraftReview({ draft, onUpdate }: { draft: Draft; onUpdate: (d: Draft) => void }) {
  // Rich-structure summary (read-only counters — these aren't edited inline yet,
  // but we surface them so the user can see what was captured.)
  const richCounts = [
    { label: "Documents", value: (draft.documents?.length ?? 0) },
    { label: "Parties", value: (draft.parties?.length ?? 0) },
    { label: "Phases", value: (draft.phases?.length ?? 0) },
    { label: "Budget lines", value: (draft.budgetLineItems?.length ?? 0) },
    { label: "Tranches", value: (draft.paymentTranches?.length ?? 0) },
    { label: "KPIs", value: (draft.kpis?.length ?? 0) },
    { label: "Compliance", value: (draft.compliance?.length ?? 0) },
    { label: "Approvals", value: (draft.approvals?.length ?? 0) },
    { label: "Risks", value: (draft.risks?.length ?? 0) },
  ].filter((r) => r.value > 0);

  const updateFunder = (updates: Partial<Draft["funder"]>) => {
    onUpdate({ ...draft, funder: { ...draft.funder, ...updates } });
  };
  const updateDeliverable = (i: number, updates: Partial<Deliverable>) => {
    const next = [...draft.deliverables]; next[i] = { ...next[i], ...updates };
    onUpdate({ ...draft, deliverables: next });
  };
  const updateBudget = (i: number, updates: Partial<BudgetCategory>) => {
    const next = [...draft.budgetCategories]; next[i] = { ...next[i], ...updates };
    onUpdate({ ...draft, budgetCategories: next });
  };
  const updateReport = (i: number, updates: Partial<ReportSchedule>) => {
    const next = [...draft.reportingSchedule]; next[i] = { ...next[i], ...updates };
    onUpdate({ ...draft, reportingSchedule: next });
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Project Name</Label>
          <Input value={draft.projectName} onChange={(e) => onUpdate({ ...draft, projectName: e.target.value })} placeholder="Enter project name" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Funder Name</Label>
          <Input value={draft.funder?.name ?? ""} onChange={(e) => updateFunder({ name: e.target.value })} placeholder="Funder name" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Grant Amount (INR)</Label>
          <Input type="number" value={draft.grantAmount ?? ""} onChange={(e) => onUpdate({ ...draft, grantAmount: e.target.value === "" ? null : Number(e.target.value) })} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Date</Label>
          <Input type="date" value={draft.startDate ?? ""} onChange={(e) => onUpdate({ ...draft, startDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">End Date</Label>
          <Input type="date" value={draft.endDate ?? ""} onChange={(e) => onUpdate({ ...draft, endDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">States (comma separated)</Label>
          <Input value={(draft.states ?? []).join(", ")} onChange={(e) => onUpdate({ ...draft, states: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Karnataka, Tamil Nadu" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Project Summary</Label>
        <Textarea value={draft.summary ?? ""} onChange={(e) => onUpdate({ ...draft, summary: e.target.value })} rows={3} placeholder="Describe the project goals and commitments…" />
      </div>

      {richCounts.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-primary" />
            Rich-structure data captured
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {richCounts.map((r) => (
              <div key={r.label} className="rounded-md bg-card border px-3 py-2 text-center">
                <div className="text-lg font-bold">{r.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            These will be saved to Convex along with the core fields. View them on the project page after creation.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Deliverables &amp; Targets</h3>
          <Button variant="outline" size="sm" onClick={() => onUpdate({ ...draft, deliverables: [...draft.deliverables, { title: "", description: "", target: 0, unit: "Teachers", dueDate: draft.endDate }] })} className="h-8 text-xs">
            <Plus className="size-3 mr-1" /> Add Deliverable
          </Button>
        </div>
        <div className="grid gap-3">
          {draft.deliverables.map((d, i) => (
            <div key={i} className="group relative rounded-lg border bg-muted/20 p-4 pt-8">
              <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                onClick={() => onUpdate({ ...draft, deliverables: draft.deliverables.filter((_, idx) => idx !== i) })}>
                <Trash2 className="size-3.5" />
              </Button>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Title</Label>
                  <Input className="h-8 text-sm" value={d.title} onChange={(e) => updateDeliverable(i, { title: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Description</Label>
                  <Textarea className="text-xs" rows={2} value={d.description ?? ""} onChange={(e) => updateDeliverable(i, { description: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase text-muted-foreground">Target</Label>
                  <Input type="number" className="h-8 text-sm" value={d.target ?? ""} onChange={(e) => updateDeliverable(i, { target: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase text-muted-foreground">Unit</Label>
                  <Input className="h-8 text-sm" value={d.unit ?? ""} onChange={(e) => updateDeliverable(i, { unit: e.target.value })} placeholder="e.g. Teachers" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Due Date</Label>
                  <Input type="date" className="h-8 text-sm" value={d.dueDate ?? ""} onChange={(e) => updateDeliverable(i, { dueDate: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Budget Allocation</h3>
          <Button variant="outline" size="sm" onClick={() => onUpdate({ ...draft, budgetCategories: [...draft.budgetCategories, { name: "", amount: 0 }] })} className="h-8 text-xs">
            <Plus className="size-3 mr-1" /> Add Category
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {draft.budgetCategories.map((c, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border p-2 pr-1">
              <Input className="h-8 text-xs border-none bg-transparent focus-visible:ring-0 px-1 font-medium" value={c.name} onChange={(e) => updateBudget(i, { name: e.target.value })} />
              <Input type="number" className="h-8 text-xs w-24 border-none bg-transparent focus-visible:ring-0 px-1 text-right" value={c.amount ?? ""} onChange={(e) => updateBudget(i, { amount: e.target.value === "" ? null : Number(e.target.value) })} />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onUpdate({ ...draft, budgetCategories: draft.budgetCategories.filter((_, idx) => idx !== i) })}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Reporting Timeline</h3>
          <Button variant="outline" size="sm" onClick={() => onUpdate({ ...draft, reportingSchedule: [...draft.reportingSchedule, { label: "New Report", periodStart: "", periodEnd: "", dueDate: "" }] })} className="h-8 text-xs">
            <Plus className="size-3 mr-1" /> Add Report
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {draft.reportingSchedule.map((r, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2 relative group">
              <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => onUpdate({ ...draft, reportingSchedule: draft.reportingSchedule.filter((_, idx) => idx !== i) })}>
                <Trash2 className="size-3.5" />
              </Button>
              <Input className="h-7 text-sm font-semibold border-none px-0 focus-visible:ring-0" value={r.label} onChange={(e) => updateReport(i, { label: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] uppercase text-muted-foreground">Due Date</Label>
                  <Input type="date" className="h-7 text-[10px]" value={r.dueDate ?? ""} onChange={(e) => updateReport(i, { dueDate: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {draft.risksOrAmbiguities?.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <h3 className="font-semibold text-sm text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-4" /> Flagged risks / ambiguities
          </h3>
          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300 list-disc list-inside">
            {draft.risksOrAmbiguities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Validation: parse the user's pasted JSON ────────────────────────────────

interface ParseResult {
  draft: Draft | null;
  errors: string[];
  warnings: string[];
}

function extractJsonFromPaste(raw: string): string | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return null;
}

function parsePastedDraft(raw: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const jsonStr = extractJsonFromPaste(raw);
  if (!jsonStr) {
    return { draft: null, errors: ["No JSON object found. Paste the entire response from the LLM, including the fenced ```json block."], warnings };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { draft: null, errors: [`JSON parse failed: ${(e as Error).message}. Check for trailing commas, smart quotes, or missing brackets.`], warnings };
  }

  // Normalise + check minimal fields.
  const d = parsed as Record<string, unknown>;
  if (!d.projectName || typeof d.projectName !== "string") {
    errors.push("Missing or invalid `projectName`.");
  }
  const funderInput = (d.funder ?? {}) as { name?: unknown; contactName?: unknown; contactEmail?: unknown };
  const funderName = typeof funderInput.name === "string" ? funderInput.name : (typeof d.funderName === "string" ? d.funderName : "");
  if (!funderName) warnings.push("Funder name missing — you can fill it in below.");
  if (!d.grantAmount || typeof d.grantAmount !== "number") warnings.push("Grant amount missing or not a number.");
  if (!d.startDate) warnings.push("Start date missing.");
  if (!d.endDate) warnings.push("End date missing.");

  const draft: Draft = {
    projectName: String(d.projectName ?? "Untitled project"),
    summary: String(d.summary ?? ""),
    funder: {
      name: funderName,
      contactName: typeof funderInput.contactName === "string" ? funderInput.contactName : null,
      contactEmail: typeof funderInput.contactEmail === "string" ? funderInput.contactEmail : null,
    },
    grantAmount: typeof d.grantAmount === "number" ? d.grantAmount : null,
    startDate: typeof d.startDate === "string" ? d.startDate : null,
    endDate: typeof d.endDate === "string" ? d.endDate : null,
    states: Array.isArray(d.states) ? (d.states as unknown[]).map(String) : [],
    stateAllocations: Array.isArray(d.stateAllocations) ? (d.stateAllocations as Array<{ state: string; fraction: number }>) : undefined,
    deliverables: Array.isArray(d.deliverables) ? (d.deliverables as Deliverable[]) : [],
    milestones: Array.isArray(d.milestones) ? (d.milestones as Milestone[]) : [],
    budgetCategories: Array.isArray(d.budgetCategories) ? (d.budgetCategories as BudgetCategory[]) : [],
    reportingSchedule: Array.isArray(d.reportingSchedule) ? (d.reportingSchedule as ReportSchedule[]) : [],
    risksOrAmbiguities: Array.isArray(d.risksOrAmbiguities) ? (d.risksOrAmbiguities as unknown[]).map(String) : [],
    documents: Array.isArray(d.documents) ? (d.documents as unknown[]) : [],
    parties: Array.isArray(d.parties) ? (d.parties as unknown[]) : [],
    phases: Array.isArray(d.phases) ? (d.phases as unknown[]) : [],
    budgetLineItems: Array.isArray(d.budgetLineItems) ? (d.budgetLineItems as unknown[]) : [],
    paymentTranches: Array.isArray(d.paymentTranches) ? (d.paymentTranches as unknown[]) : [],
    kpis: Array.isArray(d.kpis) ? (d.kpis as unknown[]) : [],
    compliance: Array.isArray(d.compliance) ? (d.compliance as unknown[]) : [],
    approvals: Array.isArray(d.approvals) ? (d.approvals as unknown[]) : [],
    risks: Array.isArray(d.risks) ? (d.risks as unknown[]) : [],
  };

  return { draft: errors.length ? null : draft, errors, warnings };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntakePage() {
  const createFromAiDraft = useMutation(api.projects.createFromAiDraft);
  const router = useRouter();
  const [mode, setMode] = useState<"ai" | "manual">("ai");

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight flex items-center gap-2">
          <Sparkles className="size-6 text-primary" />
          Project Intake
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Two ways to onboard a grant project. <span className="font-medium text-foreground">AI mode</span> uses the
          built-in extractor and creates the project in 30 seconds. <span className="font-medium text-foreground">
          Manual mode</span> generates a prompt you can paste into ChatGPT, Claude, or Gemini, then accepts the
          structured JSON they produce — useful for high-stakes proposals, when the AI service is down, or when
          you want 100% control over the extraction.
        </p>
      </header>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "ai" | "manual")}>
        <TabsList>
          <TabsTrigger value="ai" className="gap-2"><Wand2 className="size-3.5" /> AI mode (fast)</TabsTrigger>
          <TabsTrigger value="manual" className="gap-2"><ClipboardPaste className="size-3.5" /> Manual mode (precise)</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-6">
          <AiIntake createFromAiDraft={createFromAiDraft} router={router} />
        </TabsContent>

        <TabsContent value="manual" className="mt-6">
          <ManualIntake createFromAiDraft={createFromAiDraft} router={router} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

// ─── AI mode (the existing flow) ──────────────────────────────────────────────

function AiIntake({
  createFromAiDraft,
  router,
}: {
  createFromAiDraft: ReturnType<typeof useMutation<typeof api.projects.createFromAiDraft>>;
  router: ReturnType<typeof useRouter>;
}) {
  const [stage, setStage] = useState<AiStage>("upload");
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [mouFile, setMouFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  function reset() {
    setStage("upload"); setProposalFile(null); setMouFile(null);
    setDraft(null); setError(""); setProgress(0); setSavedProjectId(null);
  }

  async function handleExtract() {
    if (!proposalFile && !mouFile) return;
    setStage("extracting"); setError(""); setProgress(10);
    try {
      const formData = new FormData();
      if (proposalFile) formData.append("proposal", proposalFile);
      if (mouFile) formData.append("mou", mouFile);
      setProgress(30);
      const response = await fetch("/api/ai/extract-project", { method: "POST", body: formData });
      setProgress(80);
      if (!response.ok) {
        const text = await response.text();
        setError(text); setStage("upload"); return;
      }
      const data = await response.json();
      setProgress(100); setDraft(data.draft as Draft); setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error"); setStage("upload");
    }
  }

  async function handleSave() {
    if (!draft) return;
    setStage("saving");
    try {
      const projectId = await createFromAiDraft({ draft });
      setSavedProjectId(projectId); setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project"); setStage("review");
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <div><strong>Error:</strong> {error}</div>
        </div>
      )}

      {stage === "upload" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Grant Proposal *</p>
              <FileDropZone label="Upload Proposal PDF" hint="The document you submitted to apply" file={proposalFile} onFile={setProposalFile} onClear={() => setProposalFile(null)} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">MOU / Agreement</p>
              <FileDropZone label="Upload MOU PDF" hint="The signed memorandum or grant agreement" file={mouFile} onFile={setMouFile} onClear={() => setMouFile(null)} />
            </div>
          </div>
          <Button size="lg" className="w-full sm:w-auto" onClick={handleExtract} disabled={!proposalFile && !mouFile}>
            <Sparkles className="size-4 mr-2" /> Analyse with AI
          </Button>
        </div>
      )}

      {stage === "extracting" && (
        <Card><CardContent className="py-12 flex flex-col items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-8 text-primary animate-pulse" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="font-semibold text-lg">Analysing your documents…</h2>
            <p className="text-muted-foreground text-sm max-w-sm">The AI is extracting all project details. Takes 15–60 seconds.</p>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              {progress < 40 ? "Parsing documents…" : progress < 80 ? "Running AI analysis…" : "Structuring project data…"}
            </p>
          </div>
        </CardContent></Card>
      )}

      {(stage === "review" || stage === "saving") && draft && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-500" />
                AI extraction complete — review before saving
              </CardTitle>
              <CardDescription>Edit anything that's wrong, then click "Create project".</CardDescription>
            </CardHeader>
            <CardContent><DraftReview draft={draft} onUpdate={setDraft} /></CardContent>
          </Card>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={handleSave} disabled={stage === "saving"} className="gap-2">
              {stage === "saving" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Create project
            </Button>
            <Button variant="outline" size="lg" onClick={reset} disabled={stage === "saving"}>
              <RefreshCw className="size-4 mr-2" /> Discard
            </Button>
          </div>
        </div>
      )}

      {stage === "done" && (
        <Card className="border-emerald-500/30">
          <CardContent className="py-12 flex flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-8 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-2xl">Project created!</h2>
              <p className="text-muted-foreground max-w-md">All deliverables, budget categories, milestones, and reporting schedule were saved to Convex.</p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button size="lg" onClick={() => router.push(`/projects/${savedProjectId}`)}>View project →</Button>
              <Button size="lg" variant="outline" onClick={reset}>
                <Sparkles className="size-4 mr-2" /> Intake another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Manual mode ──────────────────────────────────────────────────────────────

function ManualIntake({
  createFromAiDraft,
  router,
}: {
  createFromAiDraft: ReturnType<typeof useMutation<typeof api.projects.createFromAiDraft>>;
  router: ReturnType<typeof useRouter>;
}) {
  const [stage, setStage] = useState<ManualStage>("files");
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [mouFile, setMouFile] = useState<File | null>(null);
  const [proposalText, setProposalText] = useState("");
  const [mouText, setMouText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(
    () => buildManualIntakePrompt({ proposalText, mouText }),
    [proposalText, mouText],
  );

  function reset() {
    setStage("files"); setProposalFile(null); setMouFile(null);
    setProposalText(""); setMouText(""); setExtracting(false);
    setError(""); setPastedJson(""); setParseErrors([]); setParseWarnings([]);
    setDraft(null); setSavedProjectId(null); setCopied(false);
  }

  async function handleExtractText() {
    if (!proposalFile && !mouFile && !proposalText && !mouText) return;
    setExtracting(true); setError("");
    try {
      // If the user pasted raw text, skip the server roundtrip.
      if (!proposalFile && !mouFile && (proposalText || mouText)) {
        setStage("prompt");
        return;
      }
      const formData = new FormData();
      if (proposalFile) formData.append("proposal", proposalFile);
      if (mouFile) formData.append("mou", mouFile);
      const res = await fetch("/api/ai/extract-text", { method: "POST", body: formData });
      if (!res.ok) {
        const t = await res.text(); setError(t); return;
      }
      const data = await res.json() as { proposalText?: string; mouText?: string };
      setProposalText(data.proposalText ?? proposalText);
      setMouText(data.mouText ?? mouText);
      setStage("prompt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Text extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // older browsers — surface a tiny error inline
      setError("Couldn't copy to clipboard. Select the text manually and copy.");
    }
  }

  function downloadPrompt() {
    const blob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vepip-intake-prompt.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function validatePaste() {
    setParseErrors([]); setParseWarnings([]);
    const result = parsePastedDraft(pastedJson);
    if (result.errors.length) {
      setParseErrors(result.errors);
      if (result.warnings.length) setParseWarnings(result.warnings);
      return;
    }
    if (result.warnings.length) setParseWarnings(result.warnings);
    setDraft(result.draft); setStage("review");
  }

  async function handleSave() {
    if (!draft) return;
    setStage("saving");
    try {
      const projectId = await createFromAiDraft({ draft });
      setSavedProjectId(projectId); setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project"); setStage("review");
    }
  }

  const promptStats = useMemo(() => {
    const chars = prompt.length;
    const approxTokens = Math.ceil(chars / 4);
    return { chars, approxTokens };
  }, [prompt]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <div><strong>Error:</strong> {error}</div>
        </div>
      )}

      {/* Step indicator */}
      <ManualSteps stage={stage} />

      {/* Step 1 — upload or paste */}
      {stage === "files" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Provide your documents</CardTitle>
            <CardDescription>Upload the proposal and MOU files, OR paste their text directly below. Both are optional individually — at least one is required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Grant Proposal</p>
                <FileDropZone label="Upload Proposal PDF" hint="The document you submitted to apply" file={proposalFile} onFile={setProposalFile} onClear={() => setProposalFile(null)} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">MOU / Agreement</p>
                <FileDropZone label="Upload MOU PDF" hint="The signed memorandum or grant agreement" file={mouFile} onFile={setMouFile} onClear={() => setMouFile(null)} />
              </div>
            </div>

            <details>
              <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
                Or paste text directly (skip file upload)
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Proposal text</Label>
                  <Textarea value={proposalText} onChange={(e) => setProposalText(e.target.value)} rows={5} className="text-xs font-mono" placeholder="Paste proposal text…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">MOU text</Label>
                  <Textarea value={mouText} onChange={(e) => setMouText(e.target.value)} rows={5} className="text-xs font-mono" placeholder="Paste MOU text…" />
                </div>
              </div>
            </details>

            <Button size="lg" onClick={handleExtractText} disabled={extracting || (!proposalFile && !mouFile && !proposalText && !mouText)}>
              {extracting ? <Loader2 className="size-4 animate-spin mr-2" /> : <Wand2 className="size-4 mr-2" />}
              Extract text &amp; build prompt
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — prompt to copy */}
      {stage === "prompt" && (
        <Card>
          <CardHeader>
            <CardTitle>2. Copy this prompt into your LLM of choice</CardTitle>
            <CardDescription>
              The prompt below is complete and self-contained — it ships the full schema, your document text, and strict output rules. Paste it into Claude, ChatGPT, or Gemini. {" "}
              <span className="text-muted-foreground">{promptStats.chars.toLocaleString()} chars · ~{promptStats.approxTokens.toLocaleString()} tokens</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyPrompt} size="sm" className="gap-2">
                {copied ? <CheckCircle2 className="size-4" /> : <ClipboardCopy className="size-4" />}
                {copied ? "Copied!" : "Copy prompt to clipboard"}
              </Button>
              <Button onClick={downloadPrompt} variant="outline" size="sm" className="gap-2">
                <Download className="size-4" /> Download as .txt
              </Button>
              <Button onClick={() => setStage("paste")} variant="secondary" size="sm" className="gap-2">
                Next: paste the JSON back <ClipboardPaste className="size-4" />
              </Button>
            </div>

            <Textarea
              value={prompt}
              readOnly
              rows={18}
              className="font-mono text-[11px] bg-muted/30"
              onFocus={(e) => e.currentTarget.select()}
            />

            <div className="rounded-lg border bg-card p-4 text-sm space-y-2">
              <h4 className="font-semibold flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Tips for best results</h4>
              <ul className="space-y-1 text-muted-foreground text-xs list-disc list-inside">
                <li>Use the strongest model available — Claude Opus / Sonnet, GPT-5 / GPT-4o, Gemini 2.5 Pro. For 100% accuracy on complex MoUs, Claude tends to follow strict JSON schemas best.</li>
                <li>If the model adds prose before/after the JSON, just say <em>"Reply with ONLY the JSON block, no other text."</em></li>
                <li>If the proposal is large, paste the prompt first and confirm the model is ready, THEN paste — long contexts can sometimes fail in one shot.</li>
                <li>Don't worry about minor formatting issues in the model's reply — the paste-back validator below extracts the JSON from fenced blocks automatically.</li>
              </ul>
            </div>

            <div className="flex gap-2 text-xs">
              <a href="https://claude.ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Claude <ExternalLink className="size-3" />
              </a>
              <a href="https://chat.openai.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                ChatGPT <ExternalLink className="size-3" />
              </a>
              <a href="https://gemini.google.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Gemini <ExternalLink className="size-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — paste back */}
      {stage === "paste" && (
        <Card>
          <CardHeader>
            <CardTitle>3. Paste the LLM's JSON response below</CardTitle>
            <CardDescription>
              Paste the entire reply. The validator finds the fenced JSON block automatically and gives you specific feedback on what's missing or malformed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              rows={14}
              placeholder='Paste the LLM response here, including the ```json ... ``` block.'
              className="font-mono text-xs"
            />

            {parseErrors.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                <h4 className="font-semibold text-red-700 dark:text-red-300 mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> Couldn't parse the response
                </h4>
                <ul className="text-xs text-red-700 dark:text-red-300 list-disc list-inside">
                  {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {parseWarnings.length > 0 && parseErrors.length === 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <h4 className="font-semibold text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> Warnings — fix in review or proceed
                </h4>
                <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside">
                  {parseWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={validatePaste} disabled={!pastedJson.trim()} className="gap-2">
                <CheckCircle2 className="size-4" /> Validate &amp; preview
              </Button>
              <Button variant="outline" onClick={() => setStage("prompt")} className="gap-2">
                ← Back to prompt
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — review */}
      {(stage === "review" || stage === "saving") && draft && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-500" />
                Pasted JSON parsed — review before saving
              </CardTitle>
              <CardDescription>Edit anything below before creating the project.</CardDescription>
            </CardHeader>
            <CardContent><DraftReview draft={draft} onUpdate={setDraft} /></CardContent>
          </Card>
          {parseWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {parseWarnings.length} warning{parseWarnings.length === 1 ? "" : "s"} on import — these fields are now editable above.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={handleSave} disabled={stage === "saving"} className="gap-2">
              {stage === "saving" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Create project
            </Button>
            <Button variant="outline" size="lg" onClick={() => setStage("paste")} disabled={stage === "saving"}>
              ← Back to paste
            </Button>
            <Button variant="ghost" size="lg" onClick={reset} disabled={stage === "saving"}>
              <RefreshCw className="size-4 mr-2" /> Start over
            </Button>
          </div>
        </div>
      )}

      {/* Step 5 — done */}
      {stage === "done" && (
        <Card className="border-emerald-500/30">
          <CardContent className="py-12 flex flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-8 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-2xl">Project created!</h2>
              <p className="text-muted-foreground max-w-md">Saved via manual paste — no AI tokens used on our side. All rich-structure fields were persisted alongside the core project.</p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button size="lg" onClick={() => router.push(`/projects/${savedProjectId}`)}>View project →</Button>
              <Button size="lg" variant="outline" onClick={reset}>
                <ClipboardPaste className="size-4 mr-2" /> Intake another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const MANUAL_STEPS: Array<{ id: ManualStage; label: string }> = [
  { id: "files", label: "Documents" },
  { id: "prompt", label: "Copy prompt" },
  { id: "paste", label: "Paste JSON" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

function ManualSteps({ stage }: { stage: ManualStage }) {
  const idx = MANUAL_STEPS.findIndex((s) => s.id === stage);
  const reviewLike = stage === "saving" ? MANUAL_STEPS.findIndex((s) => s.id === "review") : idx;
  return (
    <div className="flex items-center gap-0 flex-wrap">
      {MANUAL_STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
            i < reviewLike ? "bg-emerald-500 text-white" :
            i === reviewLike ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
            "bg-muted text-muted-foreground",
          )}>
            {i < reviewLike ? "✓" : i + 1}
          </div>
          <div className={cn("text-xs ml-1.5 font-medium hidden sm:block", i === reviewLike ? "text-foreground" : "text-muted-foreground")}>
            {s.label}
          </div>
          {i < MANUAL_STEPS.length - 1 && (
            <div className={cn("mx-2 h-px w-6 sm:w-10 transition-all", i < reviewLike ? "bg-emerald-500" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}
