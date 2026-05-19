"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  RotateCw,
  Send,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from "lucide-react";

import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ToolCall {
  id: string;
  name: string;
  argsPreview: string;
  result?: string;
  status: "running" | "done" | "error";
}

interface Citation {
  chunkId: string;
  documentId: string;
  title: string;
  kind: string;
  text: string;
  projectName?: string | null;
  score: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  citations?: Citation[];
  proposals?: MutationProposal[];
  streaming?: boolean;
}

interface ChatProps {
  projectId?: Id<"projects">;
  projectName?: string;
  userEmail?: string;
}

function getThreadStorageKey(projectId: string) {
  return `vepip-thread-${projectId}`;
}

const ARTIFACT_LINK_RE = /(?:📎\s*)?\[([^\]]+)\]\(artifact:\/\/([^\s)]+)\)/g;

// D4 — inline mutation proposal markers. The agent emits a
// `<!--vepip-proposal:{json}-->` block before asking for confirmation; the UI
// parses it out, hides the comment from the rendered text, and renders an
// inline accept/cancel card. JSON shape:
//   { tool: "log_activity" | "record_expense" | ..., args: {...}, summary: "..." }
const PROPOSAL_RE = /<!--vepip-proposal:(\{[\s\S]*?\})-->/g;

interface MutationProposal {
  tool: string;
  args: Record<string, unknown>;
  summary?: string;
}

function summariseArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  try {
    const entries = Object.entries(args as Record<string, unknown>).slice(0, 4);
    return entries
      .map(([k, v]) => {
        const sv = typeof v === "string" ? v : JSON.stringify(v);
        return `${k}=${sv.length > 30 ? sv.slice(0, 27) + "…" : sv}`;
      })
      .join(" ");
  } catch {
    return "";
  }
}

function ToolCallView({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-dashed bg-muted/40 px-2 py-1 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Wrench className="size-3 shrink-0 text-primary" />
        <span className="font-medium truncate">{call.name}</span>
        {call.status === "running" && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        {call.status === "done" && <CheckCircle2 className="size-3 text-green-600" />}
        {call.status === "error" && <XCircle className="size-3 text-red-600" />}
        {call.argsPreview && !open && (
          <span className="text-muted-foreground truncate flex-1">{call.argsPreview}</span>
        )}
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-4">
          {call.argsPreview && (
            <pre className="whitespace-pre-wrap text-[10px] text-muted-foreground bg-background rounded p-1 max-h-32 overflow-auto">
              {call.argsPreview}
            </pre>
          )}
          {call.result && (
            <pre className="whitespace-pre-wrap text-[10px] bg-background rounded p-1 max-h-40 overflow-auto">
              {call.result.length > 2000 ? call.result.slice(0, 2000) + "\n…(truncated)" : call.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function CitationChips({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (c: Citation) => void;
}) {
  if (!citations.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <button
          key={c.chunkId}
          type="button"
          onClick={() => onOpen(c)}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent transition-colors max-w-[220px]"
          title={c.title}
        >
          <BookOpen className="size-2.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{c.title}</span>
        </button>
      ))}
    </div>
  );
}

function CitationPanel({
  citation,
  onClose,
}: {
  citation: Citation | null;
  onClose: () => void;
}) {
  if (!citation) return null;
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/30"
      onClick={onClose}
      role="button"
      tabIndex={-1}
    >
      <div
        className="absolute right-0 top-0 h-full w-[420px] max-w-[90vw] overflow-y-auto border-l bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {citation.kind.replace(/_/g, " ")}
            </div>
            <div className="font-semibold text-sm leading-snug">{citation.title}</div>
            {citation.projectName && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {citation.projectName}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90 bg-muted/40 rounded p-3">
          {citation.text}
        </pre>
        <div className="mt-3 text-[10px] text-muted-foreground">
          Relevance: {(citation.score * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

function extractCitations(toolCalls: ToolCall[] | undefined): Citation[] {
  if (!toolCalls) return [];
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const tc of toolCalls) {
    if (tc.name !== "search_knowledge" || !tc.result || tc.status !== "done") continue;
    try {
      const parsed = JSON.parse(tc.result) as {
        results?: Array<{
          chunkId: string;
          documentId: string;
          text: string;
          score: number;
          source: {
            kind: string;
            title: string;
            projectName?: string | null;
          };
        }>;
      };
      for (const r of parsed.results ?? []) {
        if (seen.has(r.chunkId)) continue;
        seen.add(r.chunkId);
        out.push({
          chunkId: r.chunkId,
          documentId: r.documentId,
          text: r.text,
          score: r.score,
          title: r.source?.title ?? "Untitled",
          kind: r.source?.kind ?? "document",
          projectName: r.source?.projectName ?? null,
        });
      }
    } catch {
      // ignore malformed tool result
    }
  }
  return out;
}

function extractProposals(content: string): { proposals: MutationProposal[]; cleaned: string } {
  const proposals: MutationProposal[] = [];
  PROPOSAL_RE.lastIndex = 0;
  const cleaned = content.replace(PROPOSAL_RE, (_match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr) as MutationProposal;
      if (parsed && typeof parsed.tool === "string") {
        proposals.push(parsed);
      }
    } catch {
      // ignore malformed proposal
    }
    return "";
  });
  return { proposals, cleaned: cleaned.trim() };
}

function ProposalCard({
  proposal,
  onAccept,
  onCancel,
  disabled,
}: {
  proposal: MutationProposal;
  onAccept: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const toolLabel = proposal.tool.replace(/_/g, " ");
  const argEntries = Object.entries(proposal.args ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  return (
    <div className="mt-2 rounded-lg border-2 border-amber-500/40 bg-amber-500/5 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10">
        <AlertCircle className="size-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">
          Proposed write — {toolLabel}
        </span>
      </div>
      {proposal.summary && (
        <div className="px-3 py-2 text-xs text-foreground/90 border-b border-amber-500/20">
          {proposal.summary}
        </div>
      )}
      <dl className="px-3 py-2 space-y-1 text-[11px]">
        {argEntries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="font-bold uppercase tracking-wider text-muted-foreground min-w-[100px]">
              {k.replace(/([A-Z])/g, " $1").toLowerCase()}
            </dt>
            <dd className="font-mono text-foreground break-all">
              {typeof v === "string" ? v : JSON.stringify(v)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2 px-3 py-2 border-t border-amber-500/20 bg-background/60">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onCancel} disabled={disabled}>
          <X className="size-3 mr-1" />
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs flex-1 bg-amber-600 hover:bg-amber-700" onClick={onAccept} disabled={disabled}>
          <Check className="size-3 mr-1" />
          Confirm & save
        </Button>
      </div>
    </div>
  );
}

function AssistantContent({ content, threadId }: { content: string; threadId: string | null }) {
  if (!threadId || !content.includes("artifact://")) {
    return <>{content}</>;
  }

  const parts: Array<{ type: "text" | "artifact"; value: string; href?: string; label?: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  ARTIFACT_LINK_RE.lastIndex = 0;
  while ((m = ARTIFACT_LINK_RE.exec(content)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, m.index) });
    }
    const [, label, relPath] = m;
    parts.push({
      type: "artifact",
      value: label,
      label,
      href: `/api/ai/artifact/${encodeURIComponent(threadId)}/${relPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}?download=true`,
    });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return (
    <>
      {parts.map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <a
            key={i}
            href={p.href}
            download={p.label}
            className="my-1 inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Download className="size-3" />
            {p.label}
          </a>
        ),
      )}
    </>
  );
}

export function AiChat({ projectId, projectName, userEmail }: ChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: projectId
        ? `Hi! I'm your project assistant for **${projectName ?? "this project"}**. Describe what happened in the field and I'll log it for you, update deliverables, record expenses, or help you draft reports.`
        : "Hi! I'm your Project Intelligence assistant. Open a project first to start logging activities and data.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!projectId) return;
    const key = getThreadStorageKey(projectId);
    const stored = localStorage.getItem(key);
    if (stored) {
      setThreadId(stored);
      return;
    }
    fetch("/api/ai/create-thread", { method: "POST" })
      .then((r) => r.json())
      .then((data: { threadId?: string }) => {
        if (data.threadId) {
          localStorage.setItem(key, data.threadId);
          setThreadId(data.threadId);
        }
      })
      .catch((err) => console.error("[AiChat] thread creation failed", err));
  }, [projectId]);

  function addMessage(msg: Omit<Message, "id">) {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }

  function updateMessage(id: string, update: Partial<Message>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...update } : m)));
  }

  async function sendMessage(text: string, opts: { recordUser?: boolean } = {}) {
    if (!text || busy || !threadId || !projectId) return;
    setInput("");
    setBusy(true);
    setActiveTool(null);
    setConnectionLost(false);
    setLastUserMessage(text);
    if (opts.recordUser !== false) {
      addMessage({ role: "user", content: text });
    }
    const assistantId = addMessage({ role: "assistant", content: "", streaming: true });

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          threadId,
          message: text,
          projectId,
          projectName,
          userEmail: userEmail ?? "",
          today: new Date().toISOString().slice(0, 10),
        }),
      });

      if (!res.ok || !res.body) {
        updateMessage(assistantId, { content: "Sorry, something went wrong. Please try again.", streaming: false });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Accumulators across the stream.
      const aiTextById: Record<string, string> = {};
      const toolCallById: Record<string, ToolCall> = {};

      const flush = () => {
        const fullText = Object.values(aiTextById).join("");
        const tools = Object.values(toolCallById);
        const runningTool = tools.find((t) => t.status === "running");
        setActiveTool(runningTool?.name ?? null);
        const citations = extractCitations(tools);
        const { proposals, cleaned } = extractProposals(fullText);
        updateMessage(assistantId, {
          content: cleaned || fullText,
          toolCalls: tools.length ? tools : undefined,
          citations: citations.length ? citations : undefined,
          proposals: proposals.length ? proposals : undefined,
          streaming: true,
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === "null") continue;

          let parsed: unknown;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          // messages-tuple shape: [chunk, metadata]
          // messages (singular) shape: chunk
          // values shape: full state snapshot (ignored here — we rebuild from chunks)
          const items = Array.isArray(parsed) ? [parsed] : [parsed];
          for (const item of items) {
            const chunk = Array.isArray(item) ? item[0] : item;
            if (!chunk || typeof chunk !== "object") continue;
            handleStreamChunk(chunk as Record<string, unknown>, aiTextById, toolCallById);
          }
          flush();
        }
      }

      // Mark any still-running tool as done (stream ended without explicit close).
      Object.values(toolCallById).forEach((t) => {
        if (t.status === "running") t.status = "done";
      });
      setActiveTool(null);
      updateMessage(assistantId, { streaming: false });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        updateMessage(assistantId, { content: "(Stopped)", streaming: false });
      } else {
        // D5 — connection failed mid-stream. Don't replace the bubble with a
        // generic apology; mark the connection lost and offer retry.
        updateMessage(assistantId, {
          content: "Connection lost mid-stream. You can retry the request.",
          streaming: false,
        });
        setConnectionLost(true);
      }
    } finally {
      setBusy(false);
      setActiveTool(null);
      abortRef.current = null;
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    await sendMessage(text);
  }

  function handleRetry() {
    if (!lastUserMessage) return;
    setConnectionLost(false);
    // Replay the last user message — don't re-record it (it's already in the
    // log). This is the pragmatic D5: not Last-Event-ID resume, but a
    // user-controlled retry that doesn't make them retype.
    void sendMessage(lastUserMessage, { recordUser: false });
  }

  function handleProposalAccept(proposal: MutationProposal) {
    const text = `Yes, please go ahead and save ${proposal.tool.replace(/_/g, " ")}.`;
    void sendMessage(text);
  }

  function handleProposalCancel(proposal: MutationProposal) {
    const text = `No, cancel that ${proposal.tool.replace(/_/g, " ")} — don't save it.`;
    void sendMessage(text);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleReset() {
    if (!projectId) return;
    localStorage.removeItem(getThreadStorageKey(projectId));
    setThreadId(null);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Started a new conversation for **${projectName ?? "this project"}**.`,
      },
    ]);
    fetch("/api/ai/create-thread", { method: "POST" })
      .then((r) => r.json())
      .then((data: { threadId?: string }) => {
        if (data.threadId && projectId) {
          localStorage.setItem(getThreadStorageKey(projectId), data.threadId);
          setThreadId(data.threadId);
        }
      });
  }

  const canSend = Boolean(input.trim() && !busy && threadId && projectId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all",
          "bg-primary text-primary-foreground hover:scale-105 active:scale-95",
        )}
      >
        {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[460px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Project Intelligence Assistant</div>
              <div className="text-xs text-muted-foreground truncate">
                {projectName ? `Reviewing: ${projectName}` : "Select a project to start"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
              title="Start new conversation"
            >
              New chat
            </button>
          </div>

          {/* Messages */}
          <div className="flex flex-col gap-4 overflow-y-auto p-4 h-[450px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1",
                  msg.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[94%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap space-y-2",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-foreground",
                  )}
                >
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-1">
                      {msg.toolCalls.map((tc) => (
                        <ToolCallView key={tc.id} call={tc} />
                      ))}
                    </div>
                  )}
                  {msg.content ? (
                    <AssistantContent content={msg.content} threadId={threadId} />
                  ) : msg.streaming && !msg.toolCalls?.length ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    ""
                  )}
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-middle" />
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <CitationChips citations={msg.citations} onOpen={setOpenCitation} />
                  )}
                  {msg.proposals && msg.proposals.length > 0 && (
                    <div className="space-y-2">
                      {msg.proposals.map((proposal, idx) => (
                        <ProposalCard
                          key={`${msg.id}-${idx}`}
                          proposal={proposal}
                          disabled={busy}
                          onAccept={() => handleProposalAccept(proposal)}
                          onCancel={() => handleProposalCancel(proposal)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && activeTool && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Running <span className="font-mono">{activeTool}</span>…
              </div>
            )}
            {connectionLost && !busy && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs flex items-center gap-2">
                <AlertCircle className="size-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
                <span className="flex-1 text-amber-900 dark:text-amber-100">Connection lost mid-stream.</span>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1 text-amber-900 dark:text-amber-100 font-medium hover:underline"
                >
                  <RotateCw className="size-3" />
                  Retry
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t p-3 bg-muted/20">
            <Input
              placeholder={projectId ? "What happened today?" : "Open a project to start…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!projectId}
              className="h-9 text-sm bg-background"
            />
            {busy ? (
              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 shrink-0" onClick={handleStop}>
                <X className="size-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-9 w-9 p-0 shrink-0"
                onClick={handleSend}
                disabled={!canSend}
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>

          {!projectId && (
            <div className="bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 text-center">
              Navigate to a project page to enable the assistant.
            </div>
          )}
        </div>
      )}

      <CitationPanel citation={openCitation} onClose={() => setOpenCitation(null)} />
    </>
  );
}

// ── stream chunk handler ─────────────────────────────────────────────────────

function handleStreamChunk(
  chunk: Record<string, unknown>,
  aiTextById: Record<string, string>,
  toolCallById: Record<string, ToolCall>,
) {
  const type = chunk.type as string | undefined;

  if (type === "AIMessageChunk" || type === "ai") {
    const id = (chunk.id as string) ?? "default";

    const content = chunk.content;
    if (typeof content === "string") {
      aiTextById[id] = (aiTextById[id] ?? "") + content;
    } else if (Array.isArray(content)) {
      const text = content
        .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
        .join("");
      if (text) aiTextById[id] = (aiTextById[id] ?? "") + text;
    }

    const toolCalls = (chunk.tool_calls as Array<Record<string, unknown>> | undefined) ?? [];
    for (const tc of toolCalls) {
      const tcId = (tc.id as string) ?? `${id}-${tc.name}`;
      const existing = toolCallById[tcId];
      const argsPreview = tc.args ? summariseArgs(tc.args) : existing?.argsPreview ?? "";
      toolCallById[tcId] = {
        id: tcId,
        name: (tc.name as string) ?? existing?.name ?? "tool",
        argsPreview,
        result: existing?.result,
        status:
          existing?.status === "done" || existing?.status === "error" ? existing.status : "running",
      };
    }
    return;
  }

  if (type === "tool" || type === "ToolMessage") {
    const tcId = (chunk.tool_call_id as string) ?? "";
    const existing = toolCallById[tcId];
    if (existing) {
      const result =
        typeof chunk.content === "string" ? chunk.content : JSON.stringify(chunk.content);
      const isError = (chunk as { status?: string }).status === "error";
      toolCallById[tcId] = {
        ...existing,
        result,
        status: isError ? "error" : "done",
      };
    }
  }
}
