"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  Clock,
  Download,
  FileText,
  FileType,
  FileType2,
  Loader2,
  Palette,
  Presentation,
  Sparkles,
} from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReportRunPanel, type ReportRunRequest } from "@/components/reports/report-run-panel";

type ReportType = "quarterly" | "full";
type Format = "docx" | "pdf" | "pptx";
type VibeKey = "editorial-serif" | "dark-premium" | "magazine-bold" | "ocean-corporate";

const FORMAT_OPTIONS: Array<{
  id: Format;
  label: string;
  short: string;
  desc: string;
  icon: typeof FileText;
  preview: { bg: string; accent: string; text: string };
}> = [
  {
    id: "pptx",
    label: "PowerPoint",
    short: "PPTX",
    desc: "Slide deck for board / funder presentations. HTML-rendered for premium typography.",
    icon: Presentation,
    preview: { bg: "bg-gradient-to-br from-amber-50 to-amber-100/60", accent: "bg-amber-500", text: "text-amber-950" },
  },
  {
    id: "pdf",
    label: "PDF",
    short: "PDF",
    desc: "Fixed-format report — best for archival, sharing, printing. Includes charts.",
    icon: FileType2,
    preview: { bg: "bg-gradient-to-br from-stone-50 to-stone-100/60", accent: "bg-stone-700", text: "text-stone-950" },
  },
  {
    id: "docx",
    label: "Word Document",
    short: "DOCX",
    desc: "Editable narrative report — best for written submissions, easy to edit afterwards.",
    icon: FileType,
    preview: { bg: "bg-gradient-to-br from-sky-50 to-sky-100/60", accent: "bg-sky-600", text: "text-sky-950" },
  },
];

const REPORT_TYPE_OPTIONS: Array<{ id: ReportType; label: string; desc: string }> = [
  { id: "quarterly", label: "Quarterly", desc: "Progress for a specific 3-month period" },
  { id: "full", label: "Full Project", desc: "Complete impact report from start through today" },
];

const VIBE_OPTIONS: Array<{
  id: VibeKey;
  label: string;
  tagline: string;
  description: string;
  swatch: string[];
  accent: string;
  bestFor: string;
}> = [
  {
    id: "editorial-serif",
    label: "Editorial Serif",
    tagline: "Warm cream + gold",
    description: "Magazine-feel. Italic display headlines, braille texture. Vision Empower's default identity.",
    swatch: ["#FAF7F2", "#C49A32", "#2A1508"],
    accent: "ring-amber-500",
    bestFor: "Foundation grants, narrative-heavy reports, year-end summaries",
  },
  {
    id: "dark-premium",
    label: "Dark Premium",
    tagline: "Deep navy + gold",
    description: "Tokyo-night feel. Jumbo numerals on a dark surface. Numbers-forward, board-pitch energy.",
    swatch: ["#0F1419", "#D4A537", "#F5F1E8"],
    accent: "ring-yellow-400",
    bestFor: "High-stakes pitches, tech projects, board presentations",
  },
  {
    id: "magazine-bold",
    label: "Magazine Bold",
    tagline: "Saffron + black",
    description: "Brutalist confidence. Ultra-bold sans, asymmetric blocks. Photo-led and energetic.",
    swatch: ["#FFFFFF", "#F59E0B", "#0A0A0A"],
    accent: "ring-amber-500",
    bestFor: "Activity-rich projects, photo decks, advocacy",
  },
  {
    id: "ocean-corporate",
    label: "Ocean Corporate",
    tagline: "Deep blue + slate",
    description: "Swiss grid. Restrained corporate trust. Data-led, audit-friendly, charts forward.",
    swatch: ["#FFFFFF", "#0369A1", "#0F172A"],
    accent: "ring-sky-600",
    bestFor: "Corporate CSR (banks, MNCs), audit-grade reports",
  },
];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso?: string | number) {
  if (!iso) return "";
  const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ReportsPage() {
  const portfolio = useQuery(api.projects.listPortfolio);
  const me = useQuery(api.people.current);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [reportType, setReportType] = useState<ReportType>("quarterly");
  const [format, setFormat] = useState<Format>("pdf");
  const [vibe, setVibe] = useState<VibeKey>("editorial-serif");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const [activeRun, setActiveRun] = useState<{ key: number; req: ReportRunRequest } | null>(null);

  const projects = portfolio ?? [];
  const selectedProject = projects.find((p) => p._id === selectedProjectId) ?? projects[0];
  const userEmail = me?.email ?? "";

  const pastReports = useMemo(() => {
    if (!selectedProject) return [];
    return [...(selectedProject.reports ?? [])]
      .sort((a, b) => (b.generatedAt ?? 0) - (a.generatedAt ?? 0))
      .slice(0, 8);
  }, [selectedProject]);

  const quarterlyIncomplete = reportType === "quarterly" && (!periodStart || !periodEnd);
  const canGenerate = !!selectedProject && !!userEmail && !quarterlyIncomplete;

  function handleGenerate() {
    if (!selectedProject || !userEmail) return;
    const req: ReportRunRequest = {
      projectId: selectedProject._id,
      projectName: selectedProject.name,
      funderName: selectedProject.funderName,
      format,
      reportType,
      periodStart: reportType === "quarterly" ? periodStart : undefined,
      periodEnd: reportType === "quarterly" ? periodEnd : undefined,
      userEmail,
      vibe,
    };
    setActiveRun({ key: Date.now(), req });
  }

  if (portfolio === undefined || me === undefined) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      </main>
    );
  }

  const selectedFormatOption = FORMAT_OPTIONS.find((o) => o.id === format) ?? FORMAT_OPTIONS[0];
  const selectedVibeOption = VIBE_OPTIONS.find((o) => o.id === vibe) ?? VIBE_OPTIONS[0];

  return (
    <main className="space-y-8 pb-12">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-amber-50/30 dark:to-amber-950/20 px-8 py-10">
        <div className="absolute -top-20 -right-20 size-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 size-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-3">
            <Sparkles className="size-3.5" />
            Report Studio
          </div>
          <h1 className="font-semibold text-3xl md:text-4xl tracking-tight leading-tight">
            Generate funder reports that feel as serious as the work behind them.
          </h1>
          <p className="text-muted-foreground mt-3 text-base max-w-2xl">
            Pick a project, scope, format, and visual identity — the agent assembles your narrative
            from live Convex data, renders it with publication-grade typography, and hands you a file
            you can send to a funder without editing.
          </p>
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[1fr_460px]">
        {/* ── Output panel (left, dominant) ────────────────────────────── */}
        <div className="space-y-6 order-2 xl:order-1">
          {activeRun ? (
            <ReportRunPanel
              key={activeRun.key}
              request={activeRun.req}
              onClose={() => setActiveRun(null)}
            />
          ) : (
            <EmptyOutput
              format={selectedFormatOption}
              vibe={selectedVibeOption}
              project={selectedProject}
            />
          )}

          {/* Recent reports for this project */}
          {selectedProject && pastReports.length > 0 && (
            <section className="rounded-xl border bg-card">
              <header className="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <h3 className="font-semibold text-sm">Recent reports for this project</h3>
                  <p className="text-xs text-muted-foreground">
                    Drafts and generated reports for {selectedProject.name}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">{pastReports.length} saved</div>
              </header>
              <ul className="divide-y">
                {pastReports.map((r) => (
                  <li key={r._id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                    <div className="size-9 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {r.title ?? `${r.reportType === "full" ? "Full report" : "Quarterly report"}`}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0",
                            r.status === "approved" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                            r.status === "submitted" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                            r.status === "draft" && "bg-muted text-muted-foreground",
                            r.status === "rejected" && "bg-red-500/10 text-red-700 dark:text-red-300",
                          )}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.periodStart && r.periodEnd && (
                          <>
                            {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                            {" · "}
                          </>
                        )}
                        {r.generatedAt ? `Generated ${formatDate(r.generatedAt)}` : `Due ${formatDate(r.dueDate)}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── Controls (right rail) ────────────────────────────────────── */}
        <aside className="space-y-5 order-1 xl:order-2">
          {/* Format */}
          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-5 py-3 border-b">
              <h2 className="font-semibold text-sm">1. Output format</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Pick what funders will receive.</p>
            </header>
            <div className="p-3 space-y-2">
              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = format === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormat(opt.id)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-all flex gap-3 items-start",
                      "hover:border-primary/60 hover:bg-primary/[0.02]",
                      selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background",
                    )}
                  >
                    <div className={cn("size-12 rounded-md flex items-center justify-center shrink-0 relative overflow-hidden", opt.preview.bg)}>
                      <div className={cn("absolute left-0 top-0 bottom-0 w-1", opt.preview.accent)} />
                      <Icon className={cn("size-5 relative", opt.preview.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{opt.label}</span>
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                          .{opt.short.toLowerCase()}
                        </span>
                        {selected && <Check className="size-3.5 text-primary ml-auto" />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Vibe picker */}
          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-5 py-3 border-b flex items-center gap-2">
              <Palette className="size-3.5 text-primary" />
              <div>
                <h2 className="font-semibold text-sm">2. Visual identity</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Drives palette + typography + layout.</p>
              </div>
            </header>
            <div className="p-3 grid grid-cols-2 gap-2">
              {VIBE_OPTIONS.map((opt) => {
                const selected = vibe === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVibe(opt.id)}
                    className={cn(
                      "rounded-lg border overflow-hidden text-left transition-all",
                      "hover:border-primary/60 hover:shadow-sm",
                      selected ? "border-primary ring-2 ring-primary/30" : "border-border",
                    )}
                  >
                    <div className="h-14 flex" style={{ backgroundColor: opt.swatch[0] }}>
                      <div className="flex-1 flex items-center px-2.5">
                        <span
                          className="text-xs font-bold tracking-wider uppercase truncate"
                          style={{ color: opt.swatch[2] }}
                        >
                          {opt.label}
                        </span>
                      </div>
                      <div className="w-3" style={{ backgroundColor: opt.swatch[1] }} />
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs font-medium leading-tight">{opt.tagline}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                        {opt.bestFor}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Scope */}
          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-5 py-3 border-b">
              <h2 className="font-semibold text-sm">3. Report scope</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Quarterly window or full project history.</p>
            </header>
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {REPORT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReportType(opt.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left text-xs transition",
                      reportType === opt.id ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
                    )}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {reportType === "quarterly" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Period start
                    </label>
                    <input
                      type="date"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Period end
                    </label>
                    <input
                      type="date"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Project */}
          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-5 py-3 border-b">
              <h2 className="font-semibold text-sm">4. Project</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Choose the project this report covers.</p>
            </header>
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground px-2 py-3">No projects found.</p>
              ) : (
                projects.map((p) => {
                  const selected = (selectedProject?._id ?? "") === p._id;
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => setSelectedProjectId(p._id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition",
                        selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {p.funderName} · {p.deliverablesDone}/{p.deliverablesTotal} delivs · {p.activities.length} activities
                          </div>
                        </div>
                        {selected && <Check className="size-3.5 text-primary mt-0.5 shrink-0" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <Button
            className="w-full h-11 text-sm font-semibold"
            size="lg"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            <Sparkles className="size-4 mr-2" />
            {activeRun ? `Regenerate ${format.toUpperCase()}` : `Generate ${format.toUpperCase()}`}
            <ArrowRight className="size-4 ml-2" />
          </Button>

          {quarterlyIncomplete && (
            <p className="text-xs text-muted-foreground text-center -mt-2">
              Set the reporting period dates to continue.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function EmptyOutput({
  format,
  vibe,
  project,
}: {
  format: (typeof FORMAT_OPTIONS)[number];
  vibe: (typeof VIBE_OPTIONS)[number];
  project: { name: string; funderName: string } | undefined;
}) {
  const Icon = format.icon;
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Mock document preview */}
      <div
        className="aspect-[1240/700] border-b relative overflow-hidden"
        style={{ backgroundColor: vibe.swatch[0] }}
      >
        {/* Vibe band */}
        <div
          className="absolute top-0 left-0 right-0 h-3/5 flex flex-col justify-between p-8"
          style={{ backgroundColor: vibe.swatch[2] }}
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.15em] mb-2 opacity-80" style={{ color: vibe.swatch[1] }}>
              Vision Empower
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: vibe.swatch[1] }}>
              Quarterly Funder Report
            </div>
          </div>
          <div>
            <div
              className="text-3xl md:text-4xl font-bold tracking-tight leading-tight max-w-xl truncate"
              style={{ color: vibe.swatch[0] }}
            >
              {project?.name ?? "Project name appears here"}
            </div>
            <div className="text-xs mt-2 opacity-70" style={{ color: vibe.swatch[0] }}>
              Funder · {project?.funderName ?? "—"}    Period · DD MMM – DD MMM YYYY    Grant · ₹X.XL
            </div>
          </div>
          {/* Top accent rule */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: vibe.swatch[1] }} />
        </div>
        {/* Mock content rows below the band */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 p-8 grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-md border flex flex-col justify-center items-center"
              style={{ backgroundColor: vibe.swatch[0], borderColor: vibe.swatch[1] + "33" }}
            >
              <div className="text-[10px] font-bold uppercase opacity-50 mb-1" style={{ color: vibe.swatch[2] }}>
                Metric
              </div>
              <div className="text-xl font-bold" style={{ color: vibe.swatch[2] }}>
                ###
              </div>
            </div>
          ))}
        </div>
        {/* Format badge */}
        <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm">
          <Icon className="size-3" />
          {format.short}
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Clock className="size-3" />
          Preview · what your report will look like
        </div>
        <h2 className="font-semibold text-lg">Ready when you are.</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          When you hit Generate, the agent pulls live project data, drafts the narrative through Gemini,
          then renders the file with the <span className="font-medium text-foreground">{vibe.label}</span> identity.
          You'll see every step live, and the download appears here.
        </p>
      </div>
    </div>
  );
}
