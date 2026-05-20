"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Gauge, ImageIcon, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";

import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const statusStyles = {
  on_track: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  at_risk: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  overdue: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  completed: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function label(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ProjectsPage() {
  const portfolio = useQuery(api.projects.listPortfolio);
  const currentPerson = useQuery(api.people.current);
  const createProject = useMutation(api.projects.createManual);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const canAdminister = currentPerson?.role === "admin";
  
  const [busy, setBusy] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoStorageId, setLogoStorageId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({
    name: "",
    funderName: "",
    grantAmount: "",
    startDate: "",
    endDate: "",
    states: "",
    summary: "",
  });

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setBusy(true);
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
      setBusy(false);
    }
  }

  if (portfolio === undefined) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading Projects...
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl flex items-center gap-2">
            <Gauge className="size-6 text-primary" />
            Projects
          </h1>
          <p className="text-muted-foreground mt-1">
            {canAdminister ? "Manage and monitor all Vision Empower grants." : "Monitor the projects assigned to you."}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Active Projects</CardTitle>
              <CardDescription>Select a project to view detailed tracking and logging.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {portfolio.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No projects found. Create one manually or use AI Intake.
                </div>
              ) : (
                portfolio.map((project) => {
                  const deliveryProgress = (project.deliverablesDone / Math.max(project.deliverablesTotal, 1)) * 100;
                  const spendProgress = (project.spentBudget / Math.max(project.approvedBudget || project.grantAmount, 1)) * 100;

                  return (
                    <Link
                      key={project._id}
                      href={`/projects/${project._id}`}
                      className="block w-full rounded-lg border p-4 text-left transition hover:bg-muted/40 hover:border-primary/50"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-semibold text-base">{project.name}</h2>
                              <Badge variant="outline" className={cn("text-[10px] h-5", statusStyles[project.status as keyof typeof statusStyles])}>
                                {label(project.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-muted-foreground text-sm">
                              {project.funderName} &bull; {project.states.join(", ") || "No states set"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
                            <span>Deliverables</span>
                            <span>
                              {project.deliverablesDone}/{project.deliverablesTotal}
                            </span>
                          </div>
                          <Progress value={deliveryProgress} className="h-1.5" />
                        </div>
                        <div>
                          <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
                            <span>Budget used</span>
                            <span>{Math.round(spendProgress)}%</span>
                          </div>
                          <Progress value={spendProgress} className="h-1.5" />
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {canAdminister && (
        <div>
          <Card className="rounded-lg sticky top-20">
            <CardHeader>
              <CardTitle>Create Manual Project</CardTitle>
              <CardDescription>Add a project without using AI extraction.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-4 mb-2">
                  <div className="relative size-16 rounded border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {logoPreview ? (
                      <img src={logoPreview} className="size-full object-contain p-1 bg-white" alt="Preview" />
                    ) : (
                      <ImageIcon className="size-6 text-muted-foreground" />
                    )}
                    {logoPreview && (
                      <button 
                        onClick={() => { setLogoPreview(null); setLogoStorageId(null); }}
                        className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-bl"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Funder Logo</label>
                    <Input type="file" accept="image/*" className="h-8 text-xs px-2 pt-1" onChange={handleLogoUpload} />
                  </div>
                </div>

                <Input placeholder="Project name" value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} />
                <Input placeholder="Funder Name" value={projectForm.funderName} onChange={(event) => setProjectForm({ ...projectForm, funderName: event.target.value })} />
                <div className="grid gap-2 grid-cols-2">
                  <Input placeholder="Grant Amount" type="number" value={projectForm.grantAmount} onChange={(event) => setProjectForm({ ...projectForm, grantAmount: event.target.value })} />
                  <Input placeholder="States (comma separated)" value={projectForm.states} onChange={(event) => setProjectForm({ ...projectForm, states: event.target.value })} />
                </div>
                <div className="grid gap-2 grid-cols-2">
                  <Input type="date" placeholder="Start Date" value={projectForm.startDate} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} />
                  <Input type="date" placeholder="End Date" value={projectForm.endDate} onChange={(event) => setProjectForm({ ...projectForm, endDate: event.target.value })} />
                </div>
                <Textarea placeholder="Project Summary" value={projectForm.summary} onChange={(event) => setProjectForm({ ...projectForm, summary: event.target.value })} />
              </div>
              <Button
                className="w-full"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await createProject({
                      ...projectForm,
                      grantAmount: Number(projectForm.grantAmount || 0),
                      states: projectForm.states.split(",").map((state) => state.trim()).filter(Boolean),
                      funderLogoStorageId: logoStorageId as any,
                    });
                    setProjectForm({ name: "", funderName: "", grantAmount: "", startDate: "", endDate: "", states: "", summary: "" });
                    setLogoPreview(null);
                    setLogoStorageId(null);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy || !projectForm.name || !projectForm.funderName}
              >
                {busy ? <Loader2 className="animate-spin mr-2" /> : <Plus className="mr-2" />}
                Save Project
              </Button>
            </CardContent>
          </Card>
        </div>
        )}
      </div>
    </main>
  );
}
