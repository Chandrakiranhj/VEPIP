"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Banknote, Bell, CalendarDays, CheckCircle2, FileText, Loader2, LogOut, Sparkles } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";
import { IndiaMap } from "@/components/india-map";
import { fiscalYearForDate, fiscalYearLabel } from "@/lib/fiscal-year";

const money = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
  currency: "INR",
});

const statusStyles = {
  on_track: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  at_risk: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  overdue: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  completed: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  watch: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function label(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DashboardPage() {
  return (
    <>
      <AuthLoading>
        <LoadingState label="Checking secure Vision Empower session..." />
      </AuthLoading>
      <Unauthenticated>
        <SignedOutState />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedDashboard />
      </Authenticated>
    </>
  );
}

function AuthenticatedDashboard() {
  const ensureCurrentUser = useMutation(api.people.ensureCurrentUser);
  const currentPerson = useQuery(api.people.current);
  const portfolio = useQuery(api.projects.listPortfolio, currentPerson ? {} : "skip");
  const [fiscalYear, setFiscalYear] = useState(() => fiscalYearForDate(new Date()));
  const projects = portfolio ?? [];

  useEffect(() => {
    void ensureCurrentUser();
  }, [ensureCurrentUser]);

  const fiscalYearOptions = useMemo(() => {
    const years = new Set<string>([fiscalYearForDate(new Date())]);
    for (const project of projects) {
      for (const row of project.fiscalYears ?? []) years.add(row.fiscalYear);
      for (const report of project.reports ?? []) {
        if (report.fiscalYear) years.add(report.fiscalYear);
      }
    }
    return Array.from(years).sort();
  }, [projects]);

  const projectFyAmount = (project: (typeof projects)[number]) =>
    project.fyBudgetAllocations?.find((row) => row.fiscalYear === fiscalYear)?.amount ?? 0;

  const fyProjects = projects.filter((project) =>
    project.fiscalYears?.some((row) => row.fiscalYear === fiscalYear) ||
    project.reports?.some((report) => report.fiscalYear === fiscalYear),
  );
  const metricProjects = currentPerson?.canSeeAllProjects ? fyProjects : projects;
  const allDeliverables = metricProjects.flatMap((project) =>
    project.deliverables.map((deliverable) => ({ ...deliverable, projectName: project.name })),
  );
  const allAlerts = metricProjects.flatMap((project) => project.alerts.map((alert) => ({ ...alert, projectName: project.name })));
  const portfolioBudget = currentPerson?.canSeeAllProjects
    ? fyProjects.reduce((total, project) => total + projectFyAmount(project), 0)
    : projects.reduce((total, project) => total + project.grantAmount, 0);
  const portfolioSpent = currentPerson?.canSeeAllProjects
    ? fyProjects.reduce((total, project) => {
        const fraction = project.grantAmount > 0 ? projectFyAmount(project) / project.grantAmount : 0;
        return total + project.spentBudget * fraction;
      }, 0)
    : projects.reduce((total, project) => total + project.spentBudget, 0);
  const allActiveStates = Array.from(new Set(metricProjects.flatMap((p) => p.states)));

  if (currentPerson === undefined || currentPerson === null) {
    return <LoadingState label="Preparing your Vision Empower user profile..." />;
  }

  if (portfolio === undefined) {
    return <LoadingState label="Loading authorized project portfolio..." />;
  }

  return (
    <main className="space-y-6">
      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge variant="outline" className="gap-1">
              <Sparkles className="size-3" />
              {currentPerson?.canSeeAllProjects ? "Admin View" : "My Project View"}
            </Badge>
            <div>
              <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
                Vision Empower Command Center
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {currentPerson?.canSeeAllProjects
                  ? "Overview of all active grants, financials, and alerts across the organization."
                  : "Secure view of the projects assigned to your Vision Empower account."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void authClient.signOut();
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
        {currentPerson?.canSeeAllProjects && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
            <CalendarDays className="size-4 text-primary" />
            <span className="text-sm font-medium">Fiscal year view</span>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value)}
            >
              {fiscalYearOptions.map((fy) => (
                <option key={fy} value={fy}>
                  {fiscalYearLabel(fy)}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">Budgets are prorated Apr-Mar for multi-year projects.</span>
          </div>
        )}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active grants" value={String(metricProjects.length)} helper={currentPerson?.canSeeAllProjects ? fiscalYearLabel(fiscalYear) : "Assigned projects"} icon={<FileText />} />
          <Metric label="Budget monitored" value={money.format(portfolioBudget)} helper={`${Math.round((portfolioSpent / Math.max(portfolioBudget, 1)) * 100)}% utilized`} icon={<Banknote />} />
          <Metric label="Open alerts" value={String(allAlerts.length)} helper="Unresolved system checks" icon={<Bell />} />
          <Metric label="Deliverables" value={String(allDeliverables.length)} helper="Tracked commitments" icon={<CheckCircle2 />} />
        </div>
      </div>

      {currentPerson?.canSeeAllProjects && (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Geographic Operations</CardTitle>
            <CardDescription>Footprint of all active projects across India</CardDescription>
          </CardHeader>
          <CardContent>
            <IndiaMap highlightedStates={allActiveStates} className="h-[400px]" />
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.8fr)]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Active Projects Status</CardTitle>
            <CardDescription>Health of all active grants</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {metricProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No active projects found.
              </div>
            ) : (
              <div className="space-y-3">
                {metricProjects.map((project) => (
                  <div key={project._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="flex items-center gap-4">
                      {project.funderLogoUrl ? (
                        <div className="size-12 overflow-hidden rounded border bg-white p-1 flex items-center justify-center shrink-0">
                          <img src={project.funderLogoUrl} alt={project.funderName} className="size-full object-contain" />
                        </div>
                      ) : (
                        <div className="size-12 rounded border bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 uppercase">
                          {project.funderName.substring(0, 2)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{project.name}</div>
                        <div className="text-sm text-muted-foreground">{project.funderName}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">{money.format(project.spentBudget)} / {money.format(project.grantAmount)}</div>
                        <div className="text-xs text-muted-foreground">Budget Spent</div>
                      </div>
                      <Badge variant="outline" className={statusStyles[project.status as keyof typeof statusStyles] || statusStyles.info}>
                        {label(project.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Portfolio Pulse</CardTitle>
            <CardDescription>System alerts and budget</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {metricProjects.length === 0 ? (
              <div className="text-sm text-muted-foreground">No data available.</div>
            ) : (
              <>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>Overall Portfolio Spend</span>
                    <span className="font-medium">
                      {money.format(portfolioSpent)} / {money.format(portfolioBudget)}
                    </span>
                  </div>
                  <Progress value={(portfolioSpent / Math.max(portfolioBudget, 1)) * 100} />
                </div>
                
                <div className="space-y-3">
                  <h3 className="font-medium text-sm">Recent Alerts</h3>
                  {allAlerts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No active alerts.</div>
                  ) : (
                    allAlerts.slice(0, 4).map((alert) => (
                      <div key={alert._id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Badge variant="outline" className={statusStyles[alert.severity as keyof typeof statusStyles] || statusStyles.info}>
                              {label(alert.severity)}
                            </Badge>
                            <div className="mt-2 font-medium text-sm">{alert.title}</div>
                            <div className="text-muted-foreground text-xs">{alert.projectName}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {label}
      </div>
    </main>
  );
}

function SignedOutState() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md rounded-lg">
        <CardHeader>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription>Use your Vision Empower email and password to access project data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/auth/v1/login">Go to login</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function Metric({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="[&>svg]:size-4 [&>svg]:text-primary">{icon}</span>
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
      <p className="mt-1 text-muted-foreground text-xs">{helper}</p>
    </div>
  );
}
