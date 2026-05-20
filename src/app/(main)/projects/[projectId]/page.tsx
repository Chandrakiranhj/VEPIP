"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle, Banknote, Bell, Calendar, CheckCircle2, ClipboardList, Edit3,
  Image as ImageIcon, Loader2, MapPinned, MessageSquare, Plus, Save, Trash2, Upload, Users, X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { AiChat } from "../../_components/ai-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { IndiaMap } from "@/components/india-map";
import { InfographicPromptDialog } from "@/components/project/infographic-prompt-dialog";

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0, style: "currency", currency: "INR" });

const statusStyles: Record<string, string> = {
  on_track: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  at_risk: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  overdue: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  completed: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  not_started: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  in_progress: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  watch: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  submitted: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  draft: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

function label(v: string) {
  return v.split("_").map((p) => p[0]?.toUpperCase() + p.slice(1)).join(" ");
}

type Tab = "deliverables" | "milestones" | "activities" | "financials" | "team" | "alerts" | "testimonials" | "gallery";

// ─── Milestone Timeline ────────────────────────────────────────────────────────

function MilestoneTimeline({ projectId, startDate, endDate }: {
  projectId: Id<"projects">;
  startDate: string;
  endDate: string;
}) {
  const milestones = useQuery(api.milestones.listByProject, { projectId }) ?? [];
  const addMutation = useMutation(api.milestones.add);
  const updateStatus = useMutation(api.milestones.updateStatus);
  const remove = useMutation(api.milestones.remove);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", dueDate: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = [...milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const today = new Date().toISOString().slice(0, 10);

  async function handleAdd() {
    if (!form.title || !form.dueDate) return;
    setBusy("add");
    try {
      await addMutation({ projectId, title: form.title, dueDate: form.dueDate });
      setForm({ title: "", dueDate: "" });
      setAdding(false);
    } finally {
      setBusy(null);
    }
  }

  const total = sorted.length;
  const done = sorted.filter((m) => m.status === "completed").length;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Milestone Timeline</CardTitle>
            <CardDescription>
              {done}/{total} milestones completed · {startDate} → {endDate}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            <Plus className="size-4 mr-1" /> Add Milestone
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex-1 min-w-40 space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Title</label>
              <Input
                placeholder="e.g. Mid-term funder review"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Due Date</label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="h-8"
              />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={busy === "add" || !form.title || !form.dueDate}>
              {busy === "add" ? <Loader2 className="size-3 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No milestones yet. Add one to track key project events.
          </div>
        ) : (
          <div className="relative">
            {/* Vertical spine */}
            <div className="absolute left-3.5 top-4 bottom-4 w-px bg-border" />
            <div className="space-y-3">
              {sorted.map((ms) => {
                const isOverdue = ms.status !== "completed" && ms.dueDate < today;
                const effectiveStatus = isOverdue ? "overdue" : ms.status;
                const dotColor =
                  ms.status === "completed"
                    ? "bg-emerald-500"
                    : isOverdue
                      ? "bg-red-500"
                      : ms.status === "in_progress"
                        ? "bg-blue-500"
                        : "bg-muted-foreground/30";

                return (
                  <div key={ms._id} className="flex items-start gap-4 pl-8 relative group">
                    {/* Dot */}
                    <div className={cn("absolute left-2 top-2 h-3 w-3 rounded-full border-2 border-background z-10", dotColor)} />
                    <div className="flex-1 rounded-lg border bg-background p-3 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{ms.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Due: {ms.dueDate}
                            {ms.completedAt && ` · Completed: ${ms.completedAt}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={statusStyles[effectiveStatus] ?? statusStyles.info}>
                            {label(effectiveStatus)}
                          </Badge>
                          <div className="hidden group-hover:flex items-center gap-1">
                            {ms.status !== "completed" && (
                              <button
                                type="button"
                                title="Mark complete"
                                className="rounded p-1 hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600"
                                onClick={() => updateStatus({ milestoneId: ms._id, status: "completed" })}
                              >
                                <CheckCircle2 className="size-3.5" />
                              </button>
                            )}
                            {ms.status === "not_started" && (
                              <button
                                type="button"
                                title="Mark in progress"
                                className="rounded p-1 hover:bg-blue-500/10 text-muted-foreground hover:text-blue-600"
                                onClick={() => updateStatus({ milestoneId: ms._id, status: "in_progress" })}
                              >
                                <Calendar className="size-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Delete"
                              className="rounded p-1 hover:bg-red-500/10 text-muted-foreground hover:text-red-600"
                              onClick={() => remove({ milestoneId: ms._id })}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectGalleryUpload({ projectId }: { projectId: Id<"projects"> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ caption: "", description: "" });
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const addGalleryItem = useMutation(api.impact.addGalleryItem);

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": pendingFile.type },
        body: pendingFile,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await addGalleryItem({
        projectId,
        storageId,
        caption: form.caption || undefined,
        description: form.description || undefined,
      });
      setForm({ caption: "", description: "" });
      setPendingFile(null);
      setShowForm(false);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setPendingFile(f);
            setShowForm(true);
          }
          e.target.value = "";
        }}
      />
      
      {showForm ? (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="size-12 rounded bg-slate-200 flex items-center justify-center">
              <ImageIcon className="size-6 text-slate-400" />
            </div>
            <div className="flex-1 text-sm font-medium truncate">{pendingFile?.name}</div>
          </div>
          <div className="space-y-2">
            <Input 
              placeholder="Caption (short title)" 
              value={form.caption} 
              onChange={(e) => setForm({ ...form, caption: e.target.value })} 
            />
            <Textarea 
              placeholder="Description / Info (optional details)" 
              rows={2}
              value={form.description} 
              onChange={(e) => setForm({ ...form, description: e.target.value })} 
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpload} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Upload className="size-4 mr-2" />}
              Upload Picture
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setPendingFile(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Plus className="size-4 mr-1" /> Add Project Picture
        </Button>
      )}
    </>
  );
}

// ─── Activity Evidence Viewer ──────────────────────────────────────────────────

function ActivityEvidence({ storageIds }: { storageIds: Id<"_storage">[] }) {
  const results = useQuery(api.files.getActivityUrls, { storageIds }) ?? [];
  if (results.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {results.map(({ storageId, url }) =>
        url ? (
          <a key={storageId} href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt="Evidence"
              className="h-16 w-16 rounded-lg object-cover border hover:opacity-80 transition-opacity"
            />
          </a>
        ) : null,
      )}
    </div>
  );
}

function ActivityEvidenceUpload({ activityId }: { activityId: Id<"activities"> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveEvidence = useMutation(api.files.saveActivityEvidence);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await saveEvidence({ activityId, storageId });
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <Button size="sm" variant="outline" className="h-8" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="size-3 animate-spin mr-1.5" /> : <Upload className="size-3 mr-1.5" />}
        Evidence
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as Id<"projects">;

  const project = useQuery(api.projects.getById, { projectId });
  const milestones = useQuery(api.milestones.listByProject, { projectId }) ?? [];
  const me = useQuery(api.people.current);
  const canAdminister = me?.role === "admin";
  const people = useQuery(api.people.list, canAdminister ? {} : "skip") ?? [];
  const expenses = useQuery(api.operations.listExpenses, { projectId }) ?? [];

  const logActivity = useMutation(api.operations.logActivity);
  const recordExpense = useMutation(api.operations.recordExpense);
  const updateDeliverableProgress = useMutation(api.operations.updateDeliverableProgress);
  const resolveAlert = useMutation(api.operations.resolveAlert);
  const approveExpense = useMutation(api.operations.approveExpense);
  const rejectExpense = useMutation(api.operations.rejectExpense);
  const addDeliverable = useMutation(api.operations.addDeliverable);
  const assignTeam = useMutation(api.people.assignToProject);
  const updateActivity = useMutation(api.operations.updateActivity);
  const updateProject = useMutation(api.projects.update);

  const addTestimonial = useMutation(api.impact.addTestimonial);
  const removeGalleryItem = useMutation(api.impact.removeGalleryItem);

  const [activeTab, setActiveTab] = useState<Tab>("deliverables");
  const [busy, setBusy] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", funderName: "", summary: "", grantAmount: 0, startDate: "", endDate: "" });
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [activityForm, setActivityForm] = useState({ title: "", location: "", state: "", teachersReached: "", studentsReached: "", schoolsReached: "", notes: "", testimonial: "", testimonialBy: "" });
  const [expenseForm, setExpenseForm] = useState({ amount: "", description: "", paymentMode: "" });
  const [deliverableForm, setDeliverableForm] = useState({ title: "", description: "", target: "", unit: "", dueDate: "" });
  const [showAddDeliverable, setShowAddDeliverable] = useState(false);
  const [showAddTestimonial, setShowAddTestimonial] = useState(false);
  const [impactForm, setImpactForm] = useState({ content: "", author: "", role: "" });
  const [editingTestimonial, setEditingTestimonial] = useState<string | null>(null);
  const [testimonialForm, setTestimonialForm] = useState({ testimonial: "", testimonialBy: "" });
  const [teamForm, setTeamForm] = useState({ programManagerId: "", accountManagerId: "" });

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoStorageId, setLogoStorageId] = useState<string | null>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setBusy("upload-logo");
    try {
      const postUrl = await generateUploadUrl();
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      setLogoStorageId(storageId);
      setLogoPreview(URL.createObjectURL(file));
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setBusy(null);
    }
  }

  async function run(name: string, task: () => Promise<unknown>) {
    setBusy(name);
    try { await task(); } finally { setBusy(null); }
  }

  function startEditing() {
    if (!project) return;
    setEditForm({ name: project.name, funderName: project.funderName, summary: project.summary || "", grantAmount: project.grantAmount, startDate: project.startDate, endDate: project.endDate });
    setLogoStorageId(project.funderLogoStorageId || null);
    setLogoPreview(project.funderLogoUrl || null);
    setIsEditing(true);
  }

  if (project === undefined) return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading project…</div>
    </main>
  );

  if (project === null) return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Button className="mt-4" onClick={() => router.push("/projects")}>← Back to Projects</Button>
      </div>
    </main>
  );

  const activeBudget = project.budgets.find((b) => b._id === selectedBudgetId) ?? project.budgets[0];
  const approvedBudget = project.budgets.reduce((s, b) => s + b.approvedAmount, 0);
  const spentBudget = project.budgets.reduce((s, b) => s + b.spentAmount, 0);
  const spendPct = Math.round((spentBudget / Math.max(approvedBudget, 1)) * 100);

  const pm = people.find((p) => p._id === project.programManagerId);
  const am = people.find((p) => p._id === project.accountManagerId);
  const submittedExpenses = expenses.filter((e) => e.status === "submitted");

  const tabs = ([
    { id: "deliverables", label: "Deliverables", icon: ClipboardList },
    { id: "milestones", label: "Milestones", icon: Calendar },
    { id: "activities", label: "Activities", icon: MapPinned },
    { id: "financials", label: "Financials", icon: Banknote, badge: submittedExpenses.length },
    { id: "testimonials", label: "Testimonials", icon: MessageSquare, badge: project.testimonials?.length },
    { id: "gallery", label: "Gallery", icon: ImageIcon, badge: project.gallery?.length },
    { id: "team", label: "Team", icon: Users, adminOnly: true },
    { id: "alerts", label: "Alerts", icon: AlertTriangle, badge: project.alerts.length },
  ] satisfies { id: Tab; label: string; icon: typeof ClipboardList; badge?: number; adminOnly?: boolean }[]).filter(
    (tab) => canAdminister || !tab.adminOnly,
  );

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-3">
            {isEditing ? (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative size-20 rounded border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {logoPreview ? (
                      <img src={logoPreview} className="size-full object-contain p-2 bg-white" alt="Preview" />
                    ) : (
                      <ImageIcon className="size-8 text-muted-foreground" />
                    )}
                    {logoPreview && (
                      <button 
                        onClick={() => { setLogoPreview(null); setLogoStorageId(null); }}
                        className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Funder Logo</label>
                    <div className="flex items-center gap-2">
                       <Input type="file" accept="image/*" className="h-9 text-xs" onChange={handleLogoUpload} />
                       {busy === "upload-logo" && <Loader2 className="size-4 animate-spin" />}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Project Name</label>
                    <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Funder</label>
                    <Input value={editForm.funderName} onChange={(e) => setEditForm({ ...editForm, funderName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Grant Amount</label>
                    <Input type="number" value={editForm.grantAmount} onChange={(e) => setEditForm({ ...editForm, grantAmount: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Duration</label>
                    <div className="flex items-center gap-2">
                      <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
                      <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Summary</label>
                  <Textarea value={editForm.summary} onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => run("save-project", async () => { 
                    await updateProject({ 
                      projectId, 
                      updates: { ...editForm, funderLogoStorageId: logoStorageId as any } 
                    }); 
                    setIsEditing(false); 
                  })}>
                    {busy === "save-project" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
                    Save Changes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {project.funderLogoUrl ? (
                  <div className="size-20 overflow-hidden rounded border bg-white p-2 flex items-center justify-center shrink-0 shadow-sm">
                    <img src={project.funderLogoUrl} alt={project.funderName} className="size-full object-contain" />
                  </div>
                ) : (
                  <div className="size-20 rounded border bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground shrink-0 uppercase">
                    {project.funderName.substring(0, 2)}
                  </div>
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-semibold text-2xl tracking-tight">{project.name}</h1>
                    <Badge variant="outline" className={cn("text-xs", statusStyles[project.status] ?? statusStyles.info)}>{label(project.status)}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {project.funderName} &bull; {project.states.join(", ") || "No states"} &bull; {project.startDate} → {project.endDate}
                  </p>
                  {(pm || am) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {pm && <span>PM: <strong>{pm.name}</strong></span>}
                      {pm && am && " · "}
                      {am && <span>AM: <strong>{am.name}</strong></span>}
                    </p>
                  )}
                  {project.summary && <p className="mt-2 max-w-2xl text-sm text-muted-foreground line-clamp-2">{project.summary}</p>}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {!isEditing && (
              <>
                <InfographicPromptDialog project={project} milestones={milestones} />
                {canAdminister && (
                  <Button variant="outline" size="sm" onClick={startEditing}><Edit3 className="size-4 mr-2" /> Edit</Button>
                )}
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push("/projects")}>← All Projects</Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Grant Amount", value: money.format(project.grantAmount), sub: "Total approved" },
            { label: "Budget Spent", value: money.format(spentBudget), sub: `${spendPct}% utilised` },
            { label: "Deliverables", value: `${project.deliverablesDone} / ${project.deliverablesTotal}`, sub: "Completed" },
            { label: "Open Alerts", value: String(project.alerts.length), sub: "Unresolved" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border bg-background p-4">
              <div className="text-sm text-muted-foreground">{m.label}</div>
              <div className="mt-1 font-semibold text-xl">{m.value}</div>
              <div className="text-xs text-muted-foreground">{m.sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <IndiaMap highlightedStates={project.states} className="h-64" />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">Budget Utilisation</span>
          <span>{money.format(spentBudget)} / {money.format(approvedBudget)}</span>
        </div>
        <Progress value={spendPct} className={spendPct > 90 ? "[&>div]:bg-red-500" : spendPct > 70 ? "[&>div]:bg-amber-500" : ""} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
            <t.icon className="size-4" />
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white leading-none">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Deliverables Tab ──────────────────────────────────────────────────── */}
      {activeTab === "deliverables" && (
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Deliverables</CardTitle>
                  <CardDescription>Blur the input to save progress.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddDeliverable((a) => !a)}>
                  <Plus className="size-4 mr-1" /> Add Deliverable
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showAddDeliverable && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <h4 className="font-medium text-sm">New Deliverable</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[10px] uppercase text-muted-foreground">Title *</label>
                      <Input placeholder="e.g. Train 200 teachers in Karnataka" value={deliverableForm.title} onChange={(e) => setDeliverableForm({ ...deliverableForm, title: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[10px] uppercase text-muted-foreground">Description</label>
                      <Textarea rows={2} placeholder="Context or details…" value={deliverableForm.description} onChange={(e) => setDeliverableForm({ ...deliverableForm, description: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-muted-foreground">Target Number</label>
                      <Input type="number" placeholder="e.g. 200" value={deliverableForm.target} onChange={(e) => setDeliverableForm({ ...deliverableForm, target: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-muted-foreground">Unit</label>
                      <Input placeholder="e.g. Teachers" value={deliverableForm.unit} onChange={(e) => setDeliverableForm({ ...deliverableForm, unit: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-muted-foreground">Due Date *</label>
                      <Input type="date" value={deliverableForm.dueDate} onChange={(e) => setDeliverableForm({ ...deliverableForm, dueDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === "add-deliverable" || !deliverableForm.title || !deliverableForm.dueDate}
                      onClick={() => run("add-deliverable", async () => {
                        await addDeliverable({ projectId, title: deliverableForm.title, description: deliverableForm.description || undefined, target: deliverableForm.target ? Number(deliverableForm.target) : undefined, unit: deliverableForm.unit || undefined, dueDate: deliverableForm.dueDate });
                        setDeliverableForm({ title: "", description: "", target: "", unit: "", dueDate: "" });
                        setShowAddDeliverable(false);
                      })}>
                      {busy === "add-deliverable" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                      Save Deliverable
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddDeliverable(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              {project.deliverables.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No deliverables recorded.</div>
              ) : project.deliverables.map((item) => (
                <div key={item._id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{item.title}</div>
                      {item.description && <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>}
                      <div className="text-xs text-muted-foreground mt-1">Due: {item.dueDate}</div>
                    </div>
                    <Badge variant="outline" className={statusStyles[item.status] ?? statusStyles.info}>{label(item.status)}</Badge>
                  </div>
                  {item.target != null && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input type="number" defaultValue={item.achieved ?? 0} className="h-8 w-28"
                          onBlur={(e) => updateDeliverableProgress({ deliverableId: item._id, achieved: Number(e.target.value || 0) })} />
                        <span className="text-sm text-muted-foreground">/ {item.target} {item.unit}</span>
                      </div>
                      <Progress value={((item.achieved ?? 0) / Math.max(item.target, 1)) * 100} />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Milestones Tab ────────────────────────────────────────────────────── */}
      {activeTab === "milestones" && (
        <MilestoneTimeline projectId={projectId} startDate={project.startDate} endDate={project.endDate} />
      )}

      {/* ── Activities Tab ────────────────────────────────────────────────────── */}
      {activeTab === "activities" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Field Activities</CardTitle><CardDescription>All logged field evidence, photos, and testimonials.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {project.activities.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No activities logged yet.</div>
              ) : [...project.activities].sort((a, b) => b.activityDate.localeCompare(a.activityDate)).map((act) => (
                <div key={act._id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">{act.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {act.activityDate}{act.state ? ` · ${act.state}` : ""}{act.location ? ` · ${act.location}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                        {(act.teachersReached ?? 0) > 0 && <span>👨‍🏫 {act.teachersReached} teachers</span>}
                        {(act.studentsReached ?? 0) > 0 && <span>👦 {act.studentsReached} students</span>}
                        {(act.schoolsReached ?? 0) > 0 && <span>🏫 {act.schoolsReached} schools</span>}
                      </div>
                    </div>
                    <ActivityEvidenceUpload activityId={act._id} />
                  </div>

                  {act.notes && <p className="text-sm text-muted-foreground border-l-2 pl-3">{act.notes}</p>}

                  {/* Evidence photos */}
                  {(act.evidenceStorageIds?.length ?? 0) > 0 && (
                    <ActivityEvidence storageIds={act.evidenceStorageIds!} />
                  )}

                  {/* Testimonial */}
                  {act.testimonial ? (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1">
                      <div className="text-xs font-semibold uppercase text-primary/70">Testimonial</div>
                      <p className="text-sm italic">"{act.testimonial}"</p>
                      {act.testimonialBy && <p className="text-xs text-muted-foreground">— {act.testimonialBy}</p>}
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                        onClick={() => { setEditingTestimonial(act._id); setTestimonialForm({ testimonial: act.testimonial ?? "", testimonialBy: act.testimonialBy ?? "" }); }}
                      >
                        Edit testimonial
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditingTestimonial(act._id); setTestimonialForm({ testimonial: "", testimonialBy: "" }); }}
                    >
                      <MessageSquare className="size-3" /> Add testimonial
                    </button>
                  )}

                  {editingTestimonial === act._id && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <Textarea rows={3} placeholder="Testimonial quote from a teacher, student, or community member…" value={testimonialForm.testimonial} onChange={(e) => setTestimonialForm({ ...testimonialForm, testimonial: e.target.value })} />
                      <Input placeholder="Person's name and role (e.g. Ravi Kumar, Teacher at GHS Mysore)" value={testimonialForm.testimonialBy} onChange={(e) => setTestimonialForm({ ...testimonialForm, testimonialBy: e.target.value })} className="h-8" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => run(`testimonial-${act._id}`, async () => {
                          await updateActivity({ activityId: act._id, testimonial: testimonialForm.testimonial || undefined, testimonialBy: testimonialForm.testimonialBy || undefined });
                          setEditingTestimonial(null);
                        })}>
                          {busy === `testimonial-${act._id}` ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingTestimonial(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg sticky top-20 self-start">
            <CardHeader><CardTitle>Log Activity</CardTitle><CardDescription>Record field evidence for reports.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Activity title *" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="State" value={activityForm.state} onChange={(e) => setActivityForm({ ...activityForm, state: e.target.value })} />
                <Input placeholder="Location" value={activityForm.location} onChange={(e) => setActivityForm({ ...activityForm, location: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Teachers" type="number" value={activityForm.teachersReached} onChange={(e) => setActivityForm({ ...activityForm, teachersReached: e.target.value })} />
                <Input placeholder="Students" type="number" value={activityForm.studentsReached} onChange={(e) => setActivityForm({ ...activityForm, studentsReached: e.target.value })} />
                <Input placeholder="Schools" type="number" value={activityForm.schoolsReached} onChange={(e) => setActivityForm({ ...activityForm, schoolsReached: e.target.value })} />
              </div>
              <Textarea rows={2} placeholder="Notes / observations" value={activityForm.notes} onChange={(e) => setActivityForm({ ...activityForm, notes: e.target.value })} />
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-muted-foreground font-semibold">Testimonial (optional)</label>
                <Textarea rows={2} placeholder="Quote from a teacher or student…" value={activityForm.testimonial} onChange={(e) => setActivityForm({ ...activityForm, testimonial: e.target.value })} />
                <Input placeholder="Name & role of person" value={activityForm.testimonialBy} onChange={(e) => setActivityForm({ ...activityForm, testimonialBy: e.target.value })} className="h-8" />
              </div>
              <Button className="w-full" disabled={busy === "activity" || !activityForm.title}
                onClick={() => run("activity", async () => {
                  await logActivity({ projectId, title: activityForm.title, activityDate: new Date().toISOString().slice(0, 10), state: activityForm.state || undefined, location: activityForm.location || undefined, teachersReached: activityForm.teachersReached ? Number(activityForm.teachersReached) : undefined, studentsReached: activityForm.studentsReached ? Number(activityForm.studentsReached) : undefined, schoolsReached: activityForm.schoolsReached ? Number(activityForm.schoolsReached) : undefined, notes: activityForm.notes || undefined, testimonial: activityForm.testimonial || undefined, testimonialBy: activityForm.testimonialBy || undefined });
                  setActivityForm({ title: "", location: "", state: "", teachersReached: "", studentsReached: "", schoolsReached: "", notes: "", testimonial: "", testimonialBy: "" });
                })}>
                {busy === "activity" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                Save Activity
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Testimonials Tab ─────────────────────────────────────────────────── */}
      {activeTab === "testimonials" && (
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Impact Testimonials</CardTitle>
                  <CardDescription>Qualitative feedback from teachers, students, and community members.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddTestimonial((a) => !a)}>
                  <Plus className="size-4 mr-1" /> Add Testimonial
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showAddTestimonial && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <Textarea 
                    placeholder="The impact story or quote…" 
                    rows={4} 
                    value={impactForm.content} 
                    onChange={(e) => setImpactForm({ ...impactForm, content: e.target.value })} 
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Author Name *" value={impactForm.author} onChange={(e) => setImpactForm({ ...impactForm, author: e.target.value })} />
                    <Input placeholder="Role (e.g. Science Teacher)" value={impactForm.role} onChange={(e) => setImpactForm({ ...impactForm, role: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === "add-impact" || !impactForm.content || !impactForm.author}
                      onClick={() => run("add-impact", async () => {
                        await addTestimonial({
                          projectId,
                          content: impactForm.content,
                          author: impactForm.author,
                          role: impactForm.role || undefined
                        });
                        setImpactForm({ content: "", author: "", role: "" });
                        setShowAddTestimonial(false);
                      })}>
                      {busy === "add-impact" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
                      Save Testimonial
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddTestimonial(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {project.testimonials?.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No testimonials recorded yet.</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {project.testimonials?.map((t) => (
                    <div key={t._id} className="rounded-xl border bg-primary/5 p-5 shadow-sm space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <MessageSquare className="size-12" />
                      </div>
                      <p className="text-base italic leading-relaxed text-slate-700 dark:text-slate-300">"{t.content}"</p>
                      <div>
                        <div className="font-semibold text-sm">{t.author}</div>
                        {t.role && <div className="text-xs text-muted-foreground">{t.role}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Gallery Tab ──────────────────────────────────────────────────────── */}
      {activeTab === "gallery" && (
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Project Gallery</CardTitle>
                  <CardDescription>Visual evidence of project progress and field work.</CardDescription>
                </div>
                <ProjectGalleryUpload projectId={projectId} />
              </div>
            </CardHeader>
            <CardContent>
              {project.gallery?.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                  <ImageIcon className="mx-auto size-8 mb-2 opacity-20" />
                  No pictures uploaded yet.
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {project.gallery?.map((item) => (
                    <div key={item._id} className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all">
                      <div className="aspect-video relative overflow-hidden bg-slate-100">
                        {item.url ? (
                          <img 
                            src={item.url} 
                            alt={item.caption || "Gallery item"} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-400">
                            <ImageIcon className="size-8" />
                          </div>
                        )}
                        <button 
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          onClick={() => removeGalleryItem({ galleryId: item._id })}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {(item.caption || item.description) && (
                        <div className="p-3 border-t">
                          {item.caption && <div className="font-semibold text-sm">{item.caption}</div>}
                          {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* ── Financials Tab ────────────────────────────────────────────────────── */}
      {activeTab === "financials" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Budget Overview</CardTitle>
                <CardDescription>Total spending vs approved grant.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Total Budget</div>
                    <div className="mt-1 text-2xl font-bold">{money.format(project.approvedBudget)}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Total Spent</div>
                    <div className="mt-1 text-2xl font-bold">{money.format(project.spentBudget)}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Spending by Category</h4>
                    <Badge variant="outline" className={project.spentBudget > project.approvedBudget ? statusStyles.overdue : statusStyles.on_track}>
                      {Math.round((project.spentBudget / Math.max(project.approvedBudget, 1)) * 100)}% Used
                    </Badge>
                  </div>
                  <div className="space-y-4">
                    {project.budgets.map((b) => (
                      <div key={b._id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{b.name}</span>
                          <span className="text-muted-foreground">
                            {money.format(b.spentAmount)} / {money.format(b.approvedAmount)}
                          </span>
                        </div>
                        <Progress value={(b.spentAmount / Math.max(b.approvedAmount, 1)) * 100} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Expense Approval Panel */}
            {expenses.length > 0 && (
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>All Expenses</CardTitle>
                  <CardDescription>
                    {submittedExpenses.length > 0
                      ? `${submittedExpenses.length} awaiting approval`
                      : "All expenses have been reviewed"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {expenses.map((exp) => {
                    const category = project.budgets.find((b) => b._id === exp.categoryId);
                    return (
                      <div key={exp._id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{exp.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {money.format(exp.amount)} · {category?.name ?? "Unknown"} · {exp.spentOn}
                            {exp.paymentMode && ` · ${exp.paymentMode}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={statusStyles[exp.status] ?? statusStyles.info}>
                            {label(exp.status)}
                          </Badge>
                          {exp.status === "submitted" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10"
                                disabled={busy === `approve-${exp._id}`}
                                onClick={() => run(`approve-${exp._id}`, () => approveExpense({ expenseId: exp._id }))}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-red-500/30 text-red-700 hover:bg-red-500/10"
                                disabled={busy === `reject-${exp._id}`}
                                onClick={() => run(`reject-${exp._id}`, () => rejectExpense({ expenseId: exp._id }))}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="rounded-lg sticky top-20 self-start">
            <CardHeader>
              <CardTitle>Record Expense</CardTitle>
              <CardDescription>Log spend against a budget category.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.budgets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No budget categories set up.</p>
              ) : (
                <>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={activeBudget?._id ?? ""}
                    onChange={(e) => setSelectedBudgetId(e.target.value)}
                  >
                    {project.budgets.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Amount (₹)"
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  />
                  <Input
                    placeholder="Description *"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  />
                  <Input
                    placeholder="Payment mode (NEFT, Cash…)"
                    value={expenseForm.paymentMode}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })}
                  />
                  <Button
                    className="w-full"
                    disabled={busy === "expense" || !activeBudget || !expenseForm.amount || !expenseForm.description}
                    onClick={() =>
                      activeBudget &&
                      run("expense", async () => {
                        await recordExpense({
                          projectId,
                          categoryId: activeBudget._id,
                          spentOn: new Date().toISOString().slice(0, 10),
                          amount: Number(expenseForm.amount),
                          description: expenseForm.description,
                          paymentMode: expenseForm.paymentMode || undefined,
                        });
                        setExpenseForm({ amount: "", description: "", paymentMode: "" });
                      })
                    }
                  >
                    {busy === "expense" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                    Save Expense
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Team Tab ──────────────────────────────────────────────────────────── */}
      {activeTab === "team" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Project Team</CardTitle><CardDescription>People responsible for this project.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {[
                { role: "Program Manager", person: pm, field: "programManagerId" },
                { role: "Account Manager", person: am, field: "accountManagerId" },
              ].map(({ role, person }) => (
                <div key={role} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">{role}</div>
                    {person ? (
                      <div className="mt-1">
                        <div className="font-medium text-sm">{person.name}</div>
                        {person.email && <div className="text-xs text-muted-foreground">{person.email}</div>}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-muted-foreground">Not assigned</div>
                    )}
                  </div>
                  <Badge variant="outline" className={person ? statusStyles.on_track : statusStyles.not_started}>
                    {person ? "Assigned" : "Vacant"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg sticky top-20 self-start">
            <CardHeader><CardTitle>Assign Team</CardTitle><CardDescription>Select people from the people directory.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No people in the directory yet. Add people from the People page.</p>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Program Manager</label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={teamForm.programManagerId || project.programManagerId || ""}
                      onChange={(e) => setTeamForm({ ...teamForm, programManagerId: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {people.filter((p) => p.role === "program_manager" || p.role === "account_manager").map((p) => (
                        <option key={p._id} value={p._id}>{p.name} ({label(p.role)})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Account Manager</label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={teamForm.accountManagerId || project.accountManagerId || ""}
                      onChange={(e) => setTeamForm({ ...teamForm, accountManagerId: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {people.filter((p) => p.role === "program_manager" || p.role === "account_manager").map((p) => (
                        <option key={p._id} value={p._id}>{p.name} ({label(p.role)})</option>
                      ))}
                    </select>
                  </div>
                  <Button className="w-full" disabled={busy === "assign-team"}
                    onClick={() => run("assign-team", async () => {
                      await assignTeam({
                        projectId,
                        programManagerId: (teamForm.programManagerId || project.programManagerId) as Id<"people"> | undefined,
                        accountManagerId: (teamForm.accountManagerId || project.accountManagerId) as Id<"people"> | undefined,
                      });
                      setTeamForm({ programManagerId: "", accountManagerId: "" });
                    })}>
                    {busy === "assign-team" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Users className="size-4 mr-2" />}
                    Update Team Assignment
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Alerts Tab ────────────────────────────────────────────────────────── */}
      {activeTab === "alerts" && (
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Active Alerts</CardTitle><CardDescription>Resolve once action is taken.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {project.alerts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald-500" />
                No active alerts — this project is on track!
              </div>
            ) : project.alerts.map((alert) => (
              <div key={alert._id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge variant="outline" className={statusStyles[alert.severity] ?? statusStyles.info}>{label(alert.severity)}</Badge>
                    <div className="mt-2 font-medium text-sm">{alert.title}</div>
                    {alert.dueDate && <div className="text-xs text-muted-foreground mt-0.5">Due: {alert.dueDate}</div>}
                  </div>
                  <Button size="sm" variant="outline" disabled={busy === `resolve-${alert._id}`}
                    onClick={() => run(`resolve-${alert._id}`, () => resolveAlert({ alertId: alert._id }))}>
                    Resolve
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Floating AI Chat — scoped to this project */}
      <AiChat projectId={projectId} projectName={project.name} userEmail={me?.email} />
    </main>
  );
}
