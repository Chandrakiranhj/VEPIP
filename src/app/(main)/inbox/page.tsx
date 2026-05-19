"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ExternalLink,
  FileText,
  Inbox as InboxIcon,
  ListChecks,
  Loader2,
  Receipt,
  Sparkles,
  X,
} from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "pending" | "accepted" | "dismissed" | "edited";

const STATUS_TABS: Array<{ id: Status; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "dismissed", label: "Dismissed" },
];

const KIND_META: Record<
  string,
  { label: string; icon: typeof FileText; tint: string }
> = {
  report_draft: { label: "Draft a report", icon: FileText, tint: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  activity_prefill: { label: "Activity prefill", icon: ListChecks, tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  expense_prefill: { label: "Expense prefill", icon: Receipt, tint: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  alert: { label: "Alert", icon: AlertTriangle, tint: "bg-red-500/10 text-red-700 dark:text-red-300" },
  digest: { label: "Weekly digest", icon: Sparkles, tint: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
};

function relativeTime(ms: number) {
  const diff = Date.now() - ms;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / (60 * 1000));
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

export default function InboxPage() {
  const [status, setStatus] = useState<Status>("pending");
  const suggestions = useQuery(api.aiProactive.listForUser, { status });
  const pendingCount = useQuery(api.aiProactive.countPendingForUser, {});
  const accept = useMutation(api.aiProactive.acceptSuggestion);
  const dismiss = useMutation(api.aiProactive.dismissSuggestion);
  const markEdited = useMutation(api.aiProactive.markEdited);

  const grouped = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof suggestions>>();
    if (!suggestions) return groups;
    for (const s of suggestions) {
      const k = s.projectName ?? "Org-level";
      const arr = groups.get(k) ?? [];
      arr.push(s);
      groups.set(k, arr);
    }
    return groups;
  }, [suggestions]);

  return (
    <main className="space-y-6 pb-12">
      {/* Hero */}
      <header className="rounded-2xl border bg-gradient-to-br from-violet-500/5 via-background to-sky-500/5 px-6 py-7 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300 mb-2">
            <InboxIcon className="size-3.5" />
            AI Inbox
          </div>
          <h1 className="font-semibold text-2xl md:text-3xl tracking-tight leading-tight">
            What the agent noticed for you while you were away.
          </h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base max-w-2xl">
            Risks, due-date approaches, period-close drafts, and extracted activities — surfaced here
            for human confirmation before anything is written to live tables.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatus(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors relative -mb-px",
              status === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {tab.label}
            {tab.id === "pending" && pendingCount !== undefined && pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[20px]">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {suggestions === undefined ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([projectName, items]) => (
            <section key={projectName} className="space-y-2">
              <header className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {projectName}
                </h2>
                <span className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
              </header>
              <ul className="space-y-2">
                {items.map((s) => {
                  const meta = KIND_META[s.kind] ?? KIND_META.alert;
                  const Icon = meta.icon;
                  const severity = (s.payload as { severity?: string } | undefined)?.severity;
                  return (
                    <li
                      key={s._id}
                      className="rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-sm"
                    >
                      <div className="flex items-start gap-3 px-4 py-3">
                        <div className={cn("size-9 rounded-lg inline-flex items-center justify-center shrink-0", meta.tint)}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{s.title}</span>
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {meta.label}
                            </span>
                            {severity === "critical" && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300">
                                critical
                              </span>
                            )}
                            {severity === "watch" && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                                watch
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {s.summary}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {relativeTime(s.createdAt)}
                            </span>
                            <span className="capitalize">via {s.source}</span>
                          </div>
                        </div>
                        {status === "pending" && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {s.kind === "report_draft" && s.projectId && (
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={{
                                    pathname: "/reports",
                                    query: { project: s.projectId },
                                  }}
                                >
                                  <ExternalLink className="size-3.5 mr-1" />
                                  Draft
                                </Link>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => dismiss({ suggestionId: s._id })}
                            >
                              <X className="size-3.5 mr-1" />
                              Dismiss
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => accept({ suggestionId: s._id })}
                            >
                              <Check className="size-3.5 mr-1" />
                              Accept
                            </Button>
                          </div>
                        )}
                      </div>
                      {/* Payload preview for prefill kinds */}
                      {(s.kind === "activity_prefill" || s.kind === "expense_prefill") && (
                        <div className="border-t bg-muted/20 px-4 py-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Proposed write
                          </div>
                          <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80 max-h-32 overflow-y-auto">
                            {JSON.stringify(s.payload, null, 2)}
                          </pre>
                          {status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-2 h-7 text-xs"
                              onClick={() => markEdited({ suggestionId: s._id })}
                            >
                              Mark as edited
                              <ArrowRight className="size-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function EmptyState({ status }: { status: Status }) {
  const message = {
    pending: { title: "Inbox zero.", body: "Nothing for the agent to surface right now. Triggers check hourly + daily." },
    accepted: { title: "Nothing accepted yet.", body: "Items you accept from Pending will show up here." },
    dismissed: { title: "Nothing dismissed.", body: "Items you dismiss from Pending will show up here." },
    edited: { title: "Nothing edited.", body: "Items you mark as edited will show up here." },
  }[status];
  return (
    <div className="rounded-2xl border-dashed border-2 bg-muted/20 px-6 py-16 text-center">
      <div className="size-14 rounded-2xl bg-primary/10 inline-flex items-center justify-center mb-4 text-primary mx-auto">
        <InboxIcon className="size-6" />
      </div>
      <h3 className="font-semibold text-lg">{message.title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{message.body}</p>
    </div>
  );
}
