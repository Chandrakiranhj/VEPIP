"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "upload" | "extracting" | "review" | "saving" | "done";

interface Draft {
  projectName: string;
  summary: string;
  funder: { name: string; contactName: string | null; contactEmail: string | null };
  grantAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  states: string[];
  deliverables: { title: string; description: string | null; target: number | null; unit: string | null; dueDate: string | null }[];
  milestones: { title: string; dueDate: string | null }[];
  budgetCategories: { name: string; amount: number | null }[];
  reportingSchedule: { label: string; periodStart: string | null; periodEnd: string | null; dueDate: string | null }[];
  risksOrAmbiguities: string[];
}

// ─── File Drop Zone ───────────────────────────────────────────────────────────

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
            <p className="text-xs text-muted-foreground mt-2">Drag & drop or click to browse</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">PDF, DOCX, or TXT</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Draft Review Card ────────────────────────────────────────────────────────

function DraftReview({ draft, onUpdate }: { draft: Draft, onUpdate: (d: Draft) => void }) {
  const updateFunder = (updates: Partial<Draft["funder"]>) => {
    onUpdate({ ...draft, funder: { ...draft.funder, ...updates } });
  };

  const updateItem = <T extends keyof Draft>(key: T, index: number, updates: any) => {
    const list = [...(draft[key] as any[])];
    list[index] = { ...list[index], ...updates };
    onUpdate({ ...draft, [key]: list });
  };

  const addItem = <T extends keyof Draft>(key: T, defaultValue: any) => {
    onUpdate({ ...draft, [key]: [...(draft[key] as any[]), defaultValue] });
  };

  const removeItem = <T extends keyof Draft>(key: T, index: number) => {
    onUpdate({ ...draft, [key]: (draft[key] as any[]).filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-8">
      {/* Core Fields */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Project Name</Label>
          <Input
            value={draft.projectName}
            onChange={(e) => onUpdate({ ...draft, projectName: e.target.value })}
            placeholder="Enter project name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Funder Name</Label>
          <Input
            value={draft.funder.name}
            onChange={(e) => updateFunder({ name: e.target.value })}
            placeholder="Funder name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Grant Amount (INR)</Label>
          <Input
            type="number"
            value={draft.grantAmount || ""}
            onChange={(e) => onUpdate({ ...draft, grantAmount: Number(e.target.value) })}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Date</Label>
          <Input
            type="date"
            value={draft.startDate || ""}
            onChange={(e) => onUpdate({ ...draft, startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">End Date</Label>
          <Input
            type="date"
            value={draft.endDate || ""}
            onChange={(e) => onUpdate({ ...draft, endDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">States (comma separated)</Label>
          <Input
            value={draft.states.join(", ")}
            onChange={(e) => onUpdate({ ...draft, states: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
            placeholder="Karnataka, Tamil Nadu"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Project Summary</Label>
        <Textarea
          value={draft.summary}
          onChange={(e) => onUpdate({ ...draft, summary: e.target.value })}
          rows={3}
          placeholder="Describe the project goals and commitments..."
        />
      </div>

      {/* Deliverables */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">📋 Deliverables & Targets</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addItem("deliverables", { title: "", description: "", target: 0, unit: "Teachers", dueDate: draft.endDate })}
            className="h-8 text-xs"
          >
            <Plus className="size-3 mr-1" /> Add Deliverable
          </Button>
        </div>
        <div className="grid gap-3">
          {draft.deliverables.map((d, i) => (
            <div key={i} className="group relative rounded-lg border bg-muted/20 p-4 pt-8">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                onClick={() => removeItem("deliverables", i)}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Title</Label>
                  <Input
                    className="h-8 text-sm"
                    value={d.title}
                    onChange={(e) => updateItem("deliverables", i, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Description / Context</Label>
                  <Textarea
                    className="text-xs"
                    rows={2}
                    value={d.description || ""}
                    onChange={(e) => updateItem("deliverables", i, { description: e.target.value })}
                    placeholder="Provide more detail about what VE has committed to here..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase text-muted-foreground">Target Number</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={d.target || ""}
                    onChange={(e) => updateItem("deliverables", i, { target: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase text-muted-foreground">Unit</Label>
                  <Input
                    className="h-8 text-sm"
                    value={d.unit || ""}
                    onChange={(e) => updateItem("deliverables", i, { unit: e.target.value })}
                    placeholder="e.g. Teachers"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Completion Due Date</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={d.dueDate || ""}
                    onChange={(e) => updateItem("deliverables", i, { dueDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">💰 Budget Allocation</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addItem("budgetCategories", { name: "", amount: 0 })}
            className="h-8 text-xs"
          >
            <Plus className="size-3 mr-1" /> Add Category
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {draft.budgetCategories.map((c, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border p-2 pr-1">
              <Input
                className="h-8 text-xs border-none bg-transparent focus-visible:ring-0 px-1 font-medium"
                value={c.name}
                onChange={(e) => updateItem("budgetCategories", i, { name: e.target.value })}
              />
              <Input
                type="number"
                className="h-8 text-xs w-24 border-none bg-transparent focus-visible:ring-0 px-1 text-right"
                value={c.amount || ""}
                onChange={(e) => updateItem("budgetCategories", i, { amount: Number(e.target.value) })}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeItem("budgetCategories", i)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Reporting Schedule */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">📅 Reporting Timeline</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addItem("reportingSchedule", { label: "New Report", periodStart: "", periodEnd: "", dueDate: "" })}
            className="h-8 text-xs"
          >
            <Plus className="size-3 mr-1" /> Add Report
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {draft.reportingSchedule.map((r, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-3 relative group">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                onClick={() => removeItem("reportingSchedule", i)}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Input
                className="h-7 text-sm font-semibold border-none px-0 focus-visible:ring-0"
                value={r.label}
                onChange={(e) => updateItem("reportingSchedule", i, { label: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] uppercase text-muted-foreground">Due Date</Label>
                  <Input
                    type="date"
                    className="h-7 text-[10px]"
                    value={r.dueDate || ""}
                    onChange={(e) => updateItem("reportingSchedule", i, { dueDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risks */}
      {draft.risksOrAmbiguities?.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <h3 className="font-semibold text-sm text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-4" /> AI Flagged Risks / Ambiguities
          </h3>
          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300 list-disc list-inside">
            {draft.risksOrAmbiguities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Stepper Indicator ────────────────────────────────────────────────────────

const STEPS = ["Upload Documents", "AI Analysis", "Review & Confirm", "Done"];

function Stepper({ stage }: { stage: Stage }) {
  const stepIndex = stage === "upload" ? 0 : stage === "extracting" ? 1 : stage === "review" ? 2 : stage === "saving" ? 2 : 3;
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
            i < stepIndex ? "bg-emerald-500 text-white" :
            i === stepIndex ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
            "bg-muted text-muted-foreground",
          )}>
            {i < stepIndex ? "✓" : i + 1}
          </div>
          <div className={cn("hidden sm:block text-xs ml-1.5 font-medium", i === stepIndex ? "text-foreground" : "text-muted-foreground")}>
            {s}
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("mx-2 h-px w-6 sm:w-10 transition-all", i < stepIndex ? "bg-emerald-500" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntakePage() {
  const createFromAiDraft = useMutation(api.projects.createFromAiDraft);
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("upload");
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [mouFile, setMouFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  function reset() {
    setStage("upload");
    setProposalFile(null);
    setMouFile(null);
    setDraft(null);
    setError("");
    setProgress(0);
    setSavedProjectId(null);
  }

  async function handleExtract() {
    if (!proposalFile && !mouFile) return;

    console.log("[Intake] Starting extraction...");
    setStage("extracting");
    setError("");
    setProgress(10);

    try {
      const formData = new FormData();
      if (proposalFile) {
        console.log(`[Intake] Adding proposal: ${proposalFile.name}`);
        formData.append("proposal", proposalFile);
      }
      if (mouFile) {
        console.log(`[Intake] Adding MOU: ${mouFile.name}`);
        formData.append("mou", mouFile);
      }

      console.log("[Intake] Sending request to /api/ai/extract-project...");
      setProgress(30);

      const response = await fetch("/api/ai/extract-project", {
        method: "POST",
        body: formData,
      });

      console.log(`[Intake] Response status: ${response.status}`);
      setProgress(80);

      if (!response.ok) {
        const text = await response.text();
        console.error(`[Intake] Extraction failed: ${text}`);
        setError(text);
        setStage("upload");
        return;
      }

      const data = await response.json();
      console.log("[Intake] Extraction successful, draft received");
      setProgress(100);
      setDraft(data.draft as Draft);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStage("upload");
    }
  }

  async function handleSave() {
    if (!draft) return;
    setStage("saving");
    try {
      const projectId = await createFromAiDraft({ draft });
      setSavedProjectId(projectId);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
      setStage("review");
    }
  }

  const canExtract = !!(proposalFile || mouFile);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight flex items-center gap-2">
            <Sparkles className="size-6 text-primary" />
            AI Project Intake
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Upload your grant Proposal and MOU PDFs. The AI will read both documents and automatically set up the full project — deliverables, budget, timeline, and reporting schedule.
          </p>
        </div>
        {stage !== "upload" && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="size-4 mr-2" /> Start Over
          </Button>
        )}
      </div>

      {/* Stepper */}
      <Stepper stage={stage} />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <div><strong>Error:</strong> {error}</div>
        </div>
      )}

      {/* Stage: Upload */}
      {stage === "upload" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Grant Proposal *</p>
              <FileDropZone
                label="Upload Proposal PDF"
                hint="The document you submitted to apply for this grant"
                file={proposalFile}
                onFile={setProposalFile}
                onClear={() => setProposalFile(null)}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">MOU / Agreement</p>
              <FileDropZone
                label="Upload MOU PDF"
                hint="The signed memorandum of understanding or grant agreement"
                file={mouFile}
                onFile={setMouFile}
                onClear={() => setMouFile(null)}
              />
            </div>
          </div>

          <Card className="rounded-lg border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Sparkles className="size-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-primary">What the AI will automatically extract:</p>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2 text-muted-foreground">
                    {["Project name & funder details", "Grant amount & project duration", "Target states & geography", "All deliverables with targets", "Key milestones & timeline", "Budget category breakdown", "Quarterly report schedule", "Risks & ambiguities flagged"].map((item) => (
                      <li key={item} className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-500" />{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={handleExtract}
            disabled={!canExtract}
          >
            <Sparkles className="size-4 mr-2" />
            Analyse Documents with AI
          </Button>
        </div>
      )}

      {/* Stage: Extracting */}
      {stage === "extracting" && (
        <Card className="rounded-lg">
          <CardContent className="py-12 flex flex-col items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-8 text-primary animate-pulse" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="font-semibold text-lg">Analysing your documents…</h2>
              <p className="text-muted-foreground text-sm max-w-sm">
                The AI is reading through the proposal and MOU to extract all project details. This takes 15–30 seconds.
              </p>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {progress < 40 ? "Parsing documents…" : progress < 80 ? "Running AI analysis…" : "Structuring project data…"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {proposalFile && <span>📄 {proposalFile.name}</span>}
              {mouFile && <span>📄 {mouFile.name}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage: Review */}
      {(stage === "review" || stage === "saving") && draft && (
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-emerald-500" />
                    AI Extraction Complete — Review Before Saving
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Check all extracted details below. If everything looks correct, click "Confirm & Create Project".
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DraftReview draft={draft} onUpdate={setDraft} />
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={handleSave}
              disabled={stage === "saving"}
              className="gap-2"
            >
              {stage === "saving" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Confirm & Create Project in Convex
            </Button>
            <Button variant="outline" size="lg" onClick={reset} disabled={stage === "saving"}>
              <RefreshCw className="size-4 mr-2" />
              Discard & Start Over
            </Button>
          </div>
        </div>
      )}

      {/* Stage: Done */}
      {stage === "done" && (
        <Card className="rounded-lg border-emerald-500/30">
          <CardContent className="py-12 flex flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-8 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-2xl">Project Created Successfully!</h2>
              <p className="text-muted-foreground max-w-md">
                All deliverables, budget categories, milestones, and the reporting schedule have been saved to Convex and are ready for the team to use.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button size="lg" onClick={() => router.push(`/projects/${savedProjectId}`)}>
                View Project →
              </Button>
              <Button size="lg" variant="outline" onClick={reset}>
                <Sparkles className="size-4 mr-2" />
                Intake Another Project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
