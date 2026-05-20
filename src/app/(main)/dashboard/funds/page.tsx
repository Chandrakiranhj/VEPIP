"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  Banknote,
  Calendar,
  Calculator,
  CheckCircle2,
  Edit3,
  Layers,
  MapPin,
  Save,
  Sparkles,
  Target,
  TrendingUp,
  Loader2,
} from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { FundAnalytics } from "./_components/fund-analytics";
import { ExpenditureSheet } from "./_components/expenditure-sheet";
import { StateManagement } from "./_components/state-management";

// ── FY helpers ───────────────────────────────────────────────────────────────

const PLANNING_HORIZON = 7;

function fyLabel(fy: string): string {
  // "26-27" -> "FY 2026-27"
  const [a, b] = fy.split("-");
  return `FY 20${a}-${b}`;
}

function fyForDate(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function nextFy(fy: string): string {
  const [a] = fy.split("-").map((p) => parseInt(p, 10));
  const next = a + 1;
  const after = a + 2;
  return `${String(next).padStart(2, "0")}-${String(after % 100).padStart(2, "0")}`;
}

const CURRENT_FY = fyForDate(new Date());

function generateFyList(from: string, count: number): string[] {
  const out: string[] = [from];
  for (let i = 1; i < count; i++) {
    out.push(nextFy(out[out.length - 1]));
  }
  return out;
}

function fmtINR(n: number): string {
  if (!n) return "₹0";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ── Main page ───────────────────────────────────────────────────────────────

const FY_RANGE = generateFyList("23-24", 12); // covers 23-24 through 34-35

export default function FundsPage() {
  const [fiscalYear, setFiscalYear] = useState<string>(CURRENT_FY);

  return (
    <div className="p-6 space-y-6 min-h-screen">
      <header className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-amber-50/30 dark:to-amber-950/20 px-6 py-7 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-2">
              <Banknote className="size-3.5" />
              Financial Command Center
            </div>
            <h1 className="text-3xl font-semibold tracking-tight leading-tight">
              Funds &amp; multi-year planning
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-2xl">
              Live financial picture pulled from your projects, statewise coverage against targets, and
              5-7 year fund-raising plans grounded in real commitments.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fiscal Year</span>
            <Select value={fiscalYear} onValueChange={setFiscalYear}>
              <SelectTrigger className="w-[140px] h-8 border-none bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FY_RANGE.map((fy) => (
                  <SelectItem key={fy} value={fy}>
                    {fyLabel(fy)}{fy === CURRENT_FY && " (current)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border p-1">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <TrendingUp className="size-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="statewise" className="flex items-center gap-2">
            <MapPin className="size-3.5" /> Statewise Coverage
          </TabsTrigger>
          <TabsTrigger value="planning" className="flex items-center gap-2">
            <Target className="size-3.5" /> Multi-Year Planning
          </TabsTrigger>
          <TabsTrigger value="expenditure" className="flex items-center gap-2">
            <BarChart3 className="size-3.5" /> Expenditure
          </TabsTrigger>
          <TabsTrigger value="states" className="flex items-center gap-2">
            <Layers className="size-3.5" /> Manage States
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OrgOverview fiscalYear={fiscalYear} />
        </TabsContent>
        <TabsContent value="statewise" className="mt-6">
          <StatewiseCoverage fiscalYear={fiscalYear} />
        </TabsContent>
        <TabsContent value="planning" className="mt-6">
          <MultiYearPlanning />
        </TabsContent>
        <TabsContent value="expenditure" className="mt-6">
          <FundAnalytics fiscalYear={fiscalYear} />
          <div className="mt-6">
            <ExpenditureSheet fiscalYear={fiscalYear} />
          </div>
        </TabsContent>
        <TabsContent value="states" className="mt-6">
          <StateManagement fiscalYear={fiscalYear} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── 1. Org-wide Overview ─────────────────────────────────────────────────────

function OrgOverview({ fiscalYear }: { fiscalYear: string }) {
  const overview = useQuery(api.finance.getOrgFinancialOverview, { fiscalYear });
  const fyCoverage = useQuery(api.finance.getStatewiseCoverage, { fiscalYear });

  if (overview === undefined || fyCoverage === undefined) return <LoadingCard />;

  const utilisationPct = Math.round(overview.utilisation * 100);
  const activeProjects =
    overview.statusCounts.on_track + overview.statusCounts.at_risk + overview.statusCounts.overdue;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Total Committed" value={fmtINR(overview.totalCommittedGrants)} hint={`${overview.totalProjects} projects`} icon={<Banknote className="size-4" />} />
        <KpiTile label="Approved Budget" value={fmtINR(overview.totalApprovedBudget)} hint="across all projects" icon={<Calculator className="size-4" />} />
        <KpiTile label="Spent" value={fmtINR(overview.totalSpent)} hint={`${overview.expenseCount} expense records`} icon={<TrendingUp className="size-4" />} />
        <KpiTile label="Utilisation" value={`${utilisationPct}%`} hint="spent / approved" icon={<Target className="size-4" />} accent={utilisationPct >= 90 ? "warn" : utilisationPct >= 60 ? "ok" : "neutral"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status breakdown */}
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Project status
          </h3>
          <div className="space-y-2.5">
            {(["on_track", "at_risk", "overdue", "completed"] as const).map((status) => {
              const count = overview.statusCounts[status] ?? 0;
              const pct = activeProjects > 0 ? (count / Math.max(overview.totalProjects, 1)) * 100 : 0;
              return (
                <div key={status}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium capitalize">{status.replace("_", " ")}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        status === "on_track" && "bg-emerald-500",
                        status === "at_risk" && "bg-amber-500",
                        status === "overdue" && "bg-red-500",
                        status === "completed" && "bg-sky-500",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top funders */}
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Banknote className="size-4 text-primary" />
            Top funders by grant amount
          </h3>
          {overview.topFunders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No funder data yet.</p>
          ) : (
            <div className="space-y-2">
              {overview.topFunders.map((f) => {
                const max = overview.topFunders[0]?.amount || 1;
                const pct = (f.amount / max) * 100;
                return (
                  <div key={f.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium truncate max-w-[60%]">{f.name}</span>
                      <span className="text-muted-foreground font-mono">{fmtINR(f.amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* This FY snapshot */}
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            {fyLabel(fiscalYear)} snapshot
          </h3>
          <span className="text-xs text-muted-foreground">
            covered against {fmtINR(fyCoverage.totals.target)} target
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SnapTile label="Target" value={fmtINR(fyCoverage.totals.target)} />
          <SnapTile label="Covered" value={fmtINR(fyCoverage.totals.covered)} accent="primary" />
          <SnapTile label="Gap" value={fmtINR(fyCoverage.totals.gap)} accent={fyCoverage.totals.gap > 0 ? "warn" : "ok"} />
        </div>
        {fyCoverage.totals.target > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Org-wide coverage</span>
              <span className="font-medium">
                {Math.round((fyCoverage.totals.covered / fyCoverage.totals.target) * 100)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (fyCoverage.totals.covered / fyCoverage.totals.target) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── 2. Statewise Coverage ────────────────────────────────────────────────────

function StatewiseCoverage({ fiscalYear }: { fiscalYear: string }) {
  const data = useQuery(api.finance.getStatewiseCoverage, { fiscalYear });

  if (data === undefined) return <LoadingCard />;
  if (data.rows.length === 0) {
    return (
      <EmptyState
        title="No statewise activity for this fiscal year"
        body="Add projects with start/end dates overlapping this FY, or set targets on the Multi-Year Planning tab."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <SnapTile label={`${fyLabel(fiscalYear)} target`} value={fmtINR(data.totals.target)} />
        <SnapTile label="Covered by projects" value={fmtINR(data.totals.covered)} accent="primary" />
        <SnapTile label="Gap" value={fmtINR(data.totals.gap)} accent={data.totals.gap > 0 ? "warn" : "ok"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.rows.map((row) => (
          <StateCoverageCard key={row.stateCode} row={row} />
        ))}
      </div>
    </div>
  );
}

function StateCoverageCard({
  row,
}: {
  row: {
    stateName: string;
    stateCode: string;
    target: number;
    covered: number;
    gap: number;
    coveragePct: number | null;
    projects: Array<{ name: string; funderName: string; amount: number }>;
  };
}) {
  const pct = row.coveragePct ?? 0;
  const overTarget = row.target > 0 && row.covered > row.target;
  return (
    <article className="rounded-xl border bg-card overflow-hidden">
      <header className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-sm">{row.stateName}</div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {row.stateCode}
          </span>
        </div>
      </header>
      <div className="p-4 space-y-3">
        {row.target > 0 ? (
          <>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Coverage</span>
                <span className={cn("font-bold", overTarget ? "text-emerald-600" : pct >= 80 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-600")}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    overTarget ? "bg-emerald-500" : pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500",
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Target</div>
                <div className="font-bold text-sm">{fmtINR(row.target)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Covered</div>
                <div className="font-bold text-sm text-primary">{fmtINR(row.covered)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Gap</div>
                <div className={cn("font-bold text-sm", row.gap > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-600")}>
                  {row.gap > 0 ? fmtINR(row.gap) : "Met"}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground italic">
            No target set. Coverage from projects: <span className="font-bold text-foreground not-italic">{fmtINR(row.covered)}</span>
          </div>
        )}

        {row.projects.length > 0 && (
          <details>
            <summary className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground cursor-pointer">
              {row.projects.length} contributing project{row.projects.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {row.projects.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1 border-t first:border-t-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.funderName}</div>
                  </div>
                  <span className="font-mono text-[11px] shrink-0">{fmtINR(p.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

// ── 3. Multi-Year Planning ───────────────────────────────────────────────────

function MultiYearPlanning() {
  const [horizon, setHorizon] = useState<number>(PLANNING_HORIZON);
  const horizonFyList = useMemo(() => generateFyList(CURRENT_FY, horizon), [horizon]);
  const fromFy = horizonFyList[0];
  const toFy = horizonFyList[horizonFyList.length - 1];

  const matrix = useQuery(api.finance.getMultiYearTargetMatrix, { fromFy, toFy });
  const setTarget = useMutation(api.finance.setStateAnnualTarget);

  // Local editing buffer (debounce of sorts: save on blur)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  if (matrix === undefined) return <LoadingCard />;
  if (matrix.states.length === 0) {
    return (
      <EmptyState
        title="No states defined yet"
        body="Add states under the 'Manage States' tab before building a multi-year plan."
      />
    );
  }

  const cellKey = (stateId: string, fy: string) => `${stateId}:${fy}`;

  async function commitCell(stateId: Id<"states">, fy: string, raw: string) {
    const num = parseFloat(raw.replace(/[^\d.-]/g, ""));
    if (Number.isNaN(num) || num < 0) return;
    setSavingKey(cellKey(stateId, fy));
    try {
      await setTarget({ stateId, fiscalYear: fy, targetAmount: Math.round(num) });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-sm">Plan funding targets state-by-state for the next {horizon} years</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing {fyLabel(fromFy)} → {fyLabel(toFy)}. Coverage rows are derived from your existing projects automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Horizon</span>
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(parseInt(v, 10))}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 5, 7, 10].map((h) => (
                <SelectItem key={h} value={String(h)}>{h} years</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold text-muted-foreground sticky left-0 bg-muted/40 z-10">
                State
              </th>
              {matrix.fiscalYears.map((fy) => (
                <th key={fy} className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap min-w-[120px]">
                  {fyLabel(fy)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.states.map((state) => (
              <tr key={state._id} className="border-b last:border-b-0 hover:bg-muted/20">
                <td className="px-4 py-3 sticky left-0 bg-card z-10 border-r">
                  <div className="font-medium">{state.name}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">{state.code}</div>
                </td>
                {matrix.fiscalYears.map((fy) => {
                  const row = matrix.targets.find((t) => t.stateId === state._id);
                  const cell = row?.cells.find((c) => c.fy === fy);
                  const target = cell?.target ?? 0;
                  const covered = cell?.covered ?? 0;
                  const key = cellKey(state._id, fy);
                  const draftValue = drafts[key];
                  const displayValue = draftValue !== undefined ? draftValue : target > 0 ? String(target) : "";
                  const pct = target > 0 ? (covered / target) * 100 : null;
                  return (
                    <td key={fy} className="px-2 py-2 align-top min-w-[120px]">
                      <div className="relative">
                        <Input
                          type="text"
                          value={displayValue}
                          placeholder="—"
                          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          onBlur={() => {
                            const v = drafts[key];
                            if (v !== undefined && v !== String(target)) {
                              void commitCell(state._id, fy, v);
                            }
                          }}
                          className="h-8 text-right font-mono text-sm"
                        />
                        {savingKey === key && (
                          <Loader2 className="size-3 animate-spin absolute right-1 top-1/2 -translate-y-1/2 text-primary" />
                        )}
                      </div>
                      {target > 0 && (
                        <div className="text-[10px] mt-1 flex items-center justify-end gap-1.5">
                          <span className="text-muted-foreground">covered</span>
                          <span className="font-mono font-bold">{fmtINR(covered)}</span>
                          {pct !== null && (
                            <span className={cn(
                              "px-1 rounded font-bold",
                              pct >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
                              pct >= 40 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
                              "bg-red-500/15 text-red-700 dark:text-red-300",
                            )}>
                              {Math.round(pct)}%
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 border-t-2">
            <tr>
              <td className="px-4 py-3 font-bold text-sm sticky left-0 bg-muted/40 z-10 border-r">Total</td>
              {matrix.totalsByFy?.map((t) => (
                <td key={t.fy} className="px-3 py-3 text-right">
                  <div className="font-bold text-sm font-mono">{fmtINR(t.target)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    covered <span className="font-mono">{fmtINR(t.covered)}</span>
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-xs text-muted-foreground px-1 flex items-center gap-2">
        <Save className="size-3" />
        Targets save automatically when you tab/click out of a cell.
      </div>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "ok" | "warn" | "neutral";
}) {
  return (
    <div className="rounded-xl border bg-card p-4 relative overflow-hidden">
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5",
          accent === "ok" && "bg-emerald-500",
          accent === "warn" && "bg-amber-500",
          (!accent || accent === "neutral") && "bg-primary",
        )}
      />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-2 tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function SnapTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "primary" | "ok" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-center",
        accent === "primary" && "bg-primary/5 border-primary/20",
        accent === "ok" && "bg-emerald-500/5 border-emerald-500/20",
        accent === "warn" && "bg-amber-500/5 border-amber-500/20",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 tracking-tight">{value}</div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-xl border bg-card p-12 flex items-center justify-center text-muted-foreground gap-2">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border-dashed border-2 bg-muted/20 px-6 py-16 text-center">
      <div className="size-14 rounded-2xl bg-primary/10 inline-flex items-center justify-center mb-4 text-primary mx-auto">
        <Target className="size-6" />
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{body}</p>
    </div>
  );
}
