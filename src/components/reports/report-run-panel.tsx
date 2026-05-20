"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ReportRunRequest {
  projectId: string;
  projectName: string;
  funderName?: string;
  format: "docx" | "pdf" | "pptx";
  reportType: "quarterly" | "full";
  periodStart?: string;
  periodEnd?: string;
  userEmail: string;
  vibe?: "editorial-serif" | "dark-premium" | "magazine-bold" | "ocean-corporate" | null;
  generateNarrative?: boolean;
}

interface InitMeta {
  reportId: string;
  filename: string;
  downloadUrl: string;
}

type Phase = "connecting" | "narrative" | "rendering" | "done" | "error";

interface Props {
  request: ReportRunRequest;
  onClose?: () => void;
}

export function ReportRunPanel({ request, onClose }: Props) {
  const [meta, setMeta] = useState<InitMeta | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [narrative, setNarrative] = useState<string>("");
  const [narrativeBlocks, setNarrativeBlocks] = useState<Record<string, string>>({});
  const [renderLog, setRenderLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [bytes, setBytes] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const startedAt = useRef<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (phase === "done" || phase === "error") return;
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [renderLog]);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;
    runStream(request, ac.signal, {
      onInit: (m) => {
        setMeta(m);
      },
      onNarrativeStart: () => setPhase("narrative"),
      onNarrative: (text, blocks) => {
        setNarrative(text);
        if (blocks) setNarrativeBlocks(blocks);
      },
      onRenderStart: () => setPhase("rendering"),
      onRenderLog: (line) => setRenderLog((prev) => [...prev.slice(-300), line]),
      onRenderComplete: (b) => setBytes(b),
      onDone: () => setPhase("done"),
      onError: (msg) => {
        setErrorMsg(msg);
        setPhase("error");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatBytes = (n: number | null) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Hero: result preview / live state ──────────────────────────── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        {phase === "done" && meta && request.format === "pdf" ? (
          <iframe
            src={meta.downloadUrl}
            title={meta.filename}
            className="w-full aspect-[1240/780] bg-stone-100 dark:bg-stone-900"
          />
        ) : phase === "done" && meta ? (
          <ResultPlaceholder
            format={request.format}
            filename={meta.filename}
            downloadUrl={meta.downloadUrl}
            bytes={bytes}
          />
        ) : (
          <LivePreview
            phase={phase}
            elapsedMs={elapsedMs}
            request={request}
            errorMsg={errorMsg}
            narrativeBlocks={narrativeBlocks}
            narrative={narrative}
          />
        )}

        {/* Footer strip: file info + download */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {phase === "done" ? (
              <div className="size-9 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-5" />
              </div>
            ) : phase === "error" ? (
              <div className="size-9 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 inline-flex items-center justify-center shrink-0">
                <XCircle className="size-5" />
              </div>
            ) : (
              <div className="size-9 rounded-md bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">
                {meta?.filename ?? `${request.format.toUpperCase()} report`}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {request.projectName} ·{" "}
                {request.reportType === "full" ? "Full project" : `${request.periodStart} → ${request.periodEnd}`}
                {bytes !== null && ` · ${formatBytes(bytes)}`}
                {(phase === "connecting" || phase === "narrative" || phase === "rendering") &&
                  ` · ${formatElapsed(elapsedMs)} elapsed`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {meta && phase === "done" && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={meta.downloadUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5 mr-1.5" />
                    Open
                  </a>
                </Button>
                <Button asChild size="sm">
                  <a href={meta.downloadUrl} download={meta.filename}>
                    <Download className="size-3.5 mr-1.5" />
                    Download
                  </a>
                </Button>
              </>
            )}
            {(phase === "done" || phase === "error") && onClose && (
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── Phase timeline ──────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card px-5 py-4">
        <div className="grid grid-cols-3 gap-3">
          <PhaseStep
            label="Loading project data"
            sub="Convex tools"
            phase="connecting"
            current={phase}
            icon={<Database className="size-4" />}
          />
          <PhaseStep
            label="Drafting narrative"
            sub="Direct model API"
            phase="narrative"
            current={phase}
            icon={<Sparkles className="size-4" />}
          />
          <PhaseStep
            label="Rendering document"
            sub="VEPIP renderer"
            phase="rendering"
            current={phase}
            icon={<Terminal className="size-4" />}
            isLast
          />
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          <div className="font-medium mb-1">Render failed</div>
          <div className="text-xs whitespace-pre-wrap break-words">{errorMsg}</div>
        </div>
      )}

      {/* Narrative collapsible (still useful when format != pdf so the user can inspect the generated text before downloading). */}
      {Object.keys(narrativeBlocks).length > 0 ? (
        <details className="rounded-xl border bg-card" open={phase === "narrative"}>
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            Narrative draft ({Object.values(narrativeBlocks).reduce((n, v) => n + (v?.length ?? 0), 0)} chars)
          </summary>
          <div className="border-t divide-y">
            {(["overview", "achievements", "challenges", "way_forward"] as const).map((key) =>
              narrativeBlocks[key] ? (
                <div key={key} className="px-5 py-3 text-sm leading-relaxed">
                  <div className="font-bold text-[10px] uppercase tracking-[0.14em] text-primary mb-1.5">
                    {key.replace("_", " ")}
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/90">{narrativeBlocks[key]}</div>
                </div>
              ) : null,
            )}
          </div>
        </details>
      ) : narrative ? (
        <details className="rounded-xl border bg-card" open={phase === "narrative"}>
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            Narrative draft ({narrative.length} chars)
          </summary>
          <div className="border-t px-5 py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
            {narrative}
          </div>
        </details>
      ) : null}

      {renderLog.length > 0 && (
        <details className="rounded-xl border bg-card" open={phase === "rendering"}>
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium flex items-center gap-2">
            <Terminal className="size-3.5 text-muted-foreground" />
            Build log ({renderLog.length} lines)
          </summary>
          <div
            ref={logRef}
            className="border-t px-4 py-3 text-[11px] font-mono whitespace-pre-wrap max-h-72 overflow-y-auto bg-background/60 leading-relaxed"
          >
            {renderLog.join("\n")}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function PhaseStep({
  label,
  sub,
  phase,
  current,
  icon,
  isLast,
}: {
  label: string;
  sub: string;
  phase: Phase;
  current: Phase;
  icon: React.ReactNode;
  isLast?: boolean;
}) {
  const order: Phase[] = ["connecting", "narrative", "rendering", "done"];
  const idx = order.indexOf(phase);
  const currentIdx = order.indexOf(current);
  const done = current === "done" || currentIdx > idx;
  const active = currentIdx === idx && current !== "done" && current !== "error";

  return (
    <div className="relative flex items-start gap-3">
      <div
        className={cn(
          "size-8 rounded-lg inline-flex items-center justify-center shrink-0 transition-colors",
          done && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          active && "bg-primary/10 text-primary",
          !done && !active && "bg-muted text-muted-foreground",
        )}
      >
        {done ? <CheckCircle2 className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div
          className={cn(
            "text-xs font-semibold leading-tight",
            done && "text-foreground",
            active && "text-foreground",
            !done && !active && "text-muted-foreground",
          )}
        >
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
      {!isLast && (
        <div
          className={cn(
            "hidden md:block absolute top-4 left-[44px] right-[-12px] h-px",
            done ? "bg-emerald-500/40" : "bg-border",
          )}
        />
      )}
    </div>
  );
}

function LivePreview({
  phase,
  elapsedMs,
  request,
  errorMsg,
  narrativeBlocks,
  narrative,
}: {
  phase: Phase;
  elapsedMs: number;
  request: ReportRunRequest;
  errorMsg: string;
  narrativeBlocks: Record<string, string>;
  narrative: string;
}) {
  const phaseLabel = {
    connecting: "Loading project data from Convex…",
    narrative: "Gemini is drafting your narrative…",
    rendering: "Building your file inside VEPIP…",
    done: "Done.",
    error: "Something went wrong.",
  }[phase];
  return (
    <div className="aspect-[1240/780] bg-gradient-to-br from-muted/30 to-background flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated rings */}
      {phase !== "error" && (
        <>
          <div className="absolute size-40 rounded-full border-2 border-primary/20 animate-ping [animation-duration:2.5s]" />
          <div className="absolute size-64 rounded-full border-2 border-primary/10" />
          <div className="absolute size-96 rounded-full border border-primary/5" />
        </>
      )}
      <div className="relative size-20 rounded-2xl bg-primary/10 inline-flex items-center justify-center mb-5">
        {phase === "error" ? (
          <XCircle className="size-10 text-red-500" />
        ) : (
          <Loader2 className="size-10 text-primary animate-spin" />
        )}
      </div>
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-2">
        {request.format.toUpperCase()} · {request.vibe ?? "editorial-serif"}
      </div>
      <h3 className="font-semibold text-lg text-center max-w-md px-6">{phaseLabel}</h3>
      <p className="text-xs text-muted-foreground mt-2">{Math.floor(elapsedMs / 1000)}s elapsed</p>

      {/* Live narrative ticker during narrative phase */}
      {phase === "narrative" && (narrative || Object.keys(narrativeBlocks).length > 0) && (
        <div className="absolute bottom-6 inset-x-6 rounded-lg border bg-card/80 backdrop-blur p-3 text-xs max-w-2xl mx-auto">
          <div className="font-bold text-[10px] uppercase tracking-wider text-primary mb-1.5">Writing now</div>
          <div className="line-clamp-3 text-muted-foreground italic">
            {Object.values(narrativeBlocks).filter(Boolean).join(" ").slice(-280) ||
              narrative.slice(-280) ||
              "…"}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultPlaceholder({
  format,
  filename,
  downloadUrl,
  bytes,
}: {
  format: "pptx" | "docx" | "pdf";
  filename: string;
  downloadUrl: string;
  bytes: number | null;
}) {
  const formatBytes = (n: number | null) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };
  return (
    <div className="aspect-[1240/780] bg-gradient-to-br from-emerald-50 via-background to-background dark:from-emerald-950/20 flex flex-col items-center justify-center p-10 text-center">
      <div className="size-20 rounded-2xl bg-emerald-500/10 inline-flex items-center justify-center mb-5 text-emerald-600 dark:text-emerald-400">
        <FileText className="size-10" />
      </div>
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 mb-2">
        {format.toUpperCase()} ready
      </div>
      <h3 className="font-semibold text-xl mb-2 max-w-xl break-words">{filename}</h3>
      {bytes !== null && (
        <p className="text-sm text-muted-foreground mb-6">{formatBytes(bytes)}</p>
      )}
      <Button asChild size="lg">
        <a href={downloadUrl} download={filename}>
          <Download className="size-4 mr-2" />
          Download {format.toUpperCase()}
        </a>
      </Button>
      {format !== "pdf" && (
        <p className="text-xs text-muted-foreground mt-4 max-w-md">
          PowerPoint and Word files don't preview inline — download to view in the native app.
        </p>
      )}
    </div>
  );
}

// ── Stream client ────────────────────────────────────────────────────────────

interface StreamCallbacks {
  onInit: (meta: InitMeta) => void;
  onNarrativeStart: () => void;
  onNarrative: (text: string, blocks?: Record<string, string>) => void;
  onRenderStart: () => void;
  onRenderLog: (line: string) => void;
  onRenderComplete: (bytes: number) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}

function tryParseJson<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function runStream(req: ReportRunRequest, signal: AbortSignal, cb: StreamCallbacks) {
  try {
    const res = await fetch("/api/ai/generate-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      cb.onError(text || `HTTP ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const ev of events) {
        if (!ev.trim()) continue;
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of ev.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        const dataStr = dataLines.join("\n");
        if (!dataStr) continue;
        const data = tryParseJson<Record<string, unknown>>(dataStr) ?? {};

        switch (eventName) {
          case "init": {
            const reportId = String(data.report_id ?? "");
            const filename = String(data.filename ?? "");
            const downloadUrl = String(data.download_url ?? "");
            if (reportId && filename && downloadUrl) {
              cb.onInit({ reportId, filename, downloadUrl });
            }
            break;
          }
          case "narrative-start":
            cb.onNarrativeStart();
            break;
          case "narrative": {
            const blocks =
              data.blocks && typeof data.blocks === "object"
                ? (data.blocks as Record<string, string>)
                : undefined;
            cb.onNarrative(String(data.text ?? ""), blocks);
            break;
          }
          case "render-start":
            cb.onRenderStart();
            break;
          case "render-log":
            if (typeof data.line === "string") cb.onRenderLog(data.line);
            break;
          case "render-complete":
            if (typeof data.bytes === "number") cb.onRenderComplete(data.bytes);
            break;
          case "done":
            cb.onDone();
            return;
          case "error":
            cb.onError(String(data.message ?? "Unknown error"));
            return;
        }
      }
    }
    cb.onDone();
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    cb.onError(String(err));
  }
}
