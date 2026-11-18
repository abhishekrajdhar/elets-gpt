"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowUp,
  Check,
  Copy,
  Download,
  FileSearch,
  MessageSquarePlus,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  Search,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge, Button, Callout, EmptyState, Input, Skeleton, Spinner, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useFeature, useMe } from "@/lib/auth";
import { cn, fmtDateTime, VERTICAL_LABELS } from "@/lib/format";
import { postSSE } from "@/lib/sse";
import type { ChatFilters, Conversation, ConversationDetail, Message, Page } from "@/lib/types";
import { EvidencePanel } from "./evidence-panel";
import { FiltersBar } from "./filters-bar";
import { RichText } from "./rich-text";

const EMPTY_FILTERS: ChatFilters = { verticals: [], date_from: null, date_to: null, doc_types: [] };

const STARTERS = [
  "What has Elets covered on digital public infrastructure in the last year?",
  "Summarise recent BFSI coverage on fraud prevention and cyber risk.",
  "Which organisations were featured most often in e-Governance stories?",
  "Compare Digital Learning and Healthcare coverage volume by year.",
];

function normalizeFilters(f: Partial<ChatFilters> | undefined): ChatFilters {
  return { ...EMPTY_FILTERS, ...(f ?? {}) } as ChatFilters;
}

/* ---------------------------------------------------------------- Conversation list */

function ConversationList({ activeId, onSelect, onNew }: {
  activeId: string | null; onSelect: (id: string) => void; onNew: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const list = useQuery({
    queryKey: ["conversations", { q, archived }],
    queryFn: () => api<Page<Conversation>>("/conversations", { query: { q, archived, limit: 100 } }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/conversations/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
    onError: (e) => toast({ tone: "danger", title: "Couldn't update conversation", body: errorMessage(e) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (id === activeId) onNew();
    },
  });

  const fetchedAt = list.dataUpdatedAt;
  const groups = useMemo(() => {
    const items = list.data?.items ?? [];
    const today = new Date(fetchedAt).toDateString();
    const g: Record<string, Conversation[]> = { Today: [], "Previous 7 days": [], Older: [] };
    for (const c of items) {
      const d = new Date(c.updated_at);
      if (d.toDateString() === today) g.Today.push(c);
      else if (fetchedAt - d.getTime() < 7 * 86400_000) g["Previous 7 days"].push(c);
      else g.Older.push(c);
    }
    return Object.entries(g).filter(([, v]) => v.length);
  }, [list.data, fetchedAt]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 p-3">
        <Button variant="primary" className="w-full" onClick={onNew}><MessageSquarePlus className="h-4 w-4" />New conversation</Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="h-8 pl-8 text-[13px]" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scroll-thin">
        {list.isLoading ? (
          <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : !list.data?.items.length ? (
          <div className="px-3 py-8 text-center text-[13px] text-muted">
            {q ? "No conversations match." : archived ? "No archived conversations." : "No conversations yet."}
          </div>
        ) : groups.map(([label, convs]) => (
          <div key={label} className="mb-2">
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
            {convs.map((c) => (
              <div key={c.id} className="group relative">
                {renaming?.id === c.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); update.mutate({ id: c.id, body: { title: renaming.title } }); setRenaming(null); }}>
                    <Input autoFocus value={renaming.title} onChange={(e) => setRenaming({ id: c.id, title: e.target.value })}
                      onBlur={() => setRenaming(null)} className="h-8 text-[13px]" />
                  </form>
                ) : (
                  <button onClick={() => onSelect(c.id)}
                    className={cn("flex w-full items-center rounded-lg px-2.5 py-2 pr-8 text-left text-[13px] transition-colors",
                      c.id === activeId ? "bg-surface-3 font-medium text-text" : "text-text-2 hover:bg-surface-2")}>
                    <span className="truncate">{c.title}</span>
                  </button>
                )}
                {renaming?.id !== c.id && (
                  <button onClick={() => setMenu(menu === c.id ? null : c.id)} aria-label="Conversation actions"
                    className="absolute right-1 top-1 rounded-md p-1 text-muted opacity-0 hover:bg-surface-3 hover:text-text group-hover:opacity-100 focus:opacity-100">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
                {menu === c.id && (
                  <div className="absolute right-1 top-8 z-20 w-40 rounded-lg border border-border bg-surface p-1 shadow-pop" onMouseLeave={() => setMenu(null)}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-2 hover:bg-surface-2"
                      onClick={() => { setRenaming({ id: c.id, title: c.title }); setMenu(null); }}><Pencil className="h-3.5 w-3.5" />Rename</button>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-2 hover:bg-surface-2"
                      onClick={() => { update.mutate({ id: c.id, body: { archived: !archived } }); setMenu(null); }}>
                      {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}{archived ? "Restore" : "Archive"}
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-danger hover:bg-danger-soft"
                      onClick={() => { if (confirm("Delete this conversation permanently?")) remove.mutate(c.id); setMenu(null); }}>
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-border p-2">
        <button onClick={() => setArchived((a) => !a)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-muted hover:bg-surface-2 hover:text-text">
          {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          {archived ? "Back to active conversations" : "Archived conversations"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Message bubble */

function AssistantMessage({ m, selected, activeCite, onSelect, onCite, onAsk, conversationId }: {
  m: Message; selected: boolean; activeCite: number | null; onSelect: () => void; onCite: (n: number) => void;
  onAsk: (q: string) => void; conversationId: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const feedback = useMutation({
    mutationFn: (v: number) => api(`/conversations/${conversationId}/messages/${m.id}/feedback`, { method: "POST", body: { feedback: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation", conversationId] }),
    onError: (e) => toast({ tone: "danger", title: "Feedback not saved", body: errorMessage(e) }),
  });
  const copy = async () => {
    const refs = m.citations.map((c) => `[${c.index}] ${c.title} — ${c.url}`).join("\n");
    await navigator.clipboard.writeText(m.content + (refs ? `\n\nSources:\n${refs}` : ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (m.status === "error") {
    const notReady = m.error_code === "engine_not_ready";
    return (
      <div className="max-w-[720px]">
        <Callout tone={notReady ? "warning" : "danger"} title={notReady ? "Answer engine not enabled yet" : "The answer could not be generated"}>
          {m.content || "An error occurred while answering."}
          {notReady && <div className="mt-1.5 text-muted">No answer was fabricated. Retrieval and grounded generation ship in Phases 3–4.</div>}
        </Callout>
      </div>
    );
  }

  return (
    <div className={cn("group max-w-[760px] rounded-2xl border px-5 py-4 transition-colors",
      selected ? "border-accent/30 bg-surface" : "border-transparent bg-transparent hover:border-border")} onClick={onSelect}>
      <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent text-white"><Sparkles className="h-3 w-3" /></span>
        <span className="font-medium text-text-2">EletsGPT</span>
        {m.query_type && <Badge>{m.query_type.replace("_", " ")}</Badge>}
        {m.status === "abstained" && <Badge tone="warning">Insufficient evidence</Badge>}
        {m.status === "streaming" && <span className="inline-flex gap-1"><span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" /><span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" /></span>}
      </div>
      {m.content ? <RichText text={m.content} onCite={onCite} activeCite={selected ? activeCite : null} /> :
        <div className="h-5" />}
      {m.related_questions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {m.related_questions.map((q) => (
            <button key={q} onClick={(e) => { e.stopPropagation(); onAsk(q); }}
              className="rounded-full border border-border px-3 py-1 text-[12.5px] text-text-2 hover:border-accent/40 hover:bg-accent-soft hover:text-accent-text">{q}</button>
          ))}
        </div>
      )}
      {m.status !== "streaming" && (
        <div className="mt-3 flex items-center gap-1 text-muted">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copy(); }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</Button>
          <Button variant="ghost" size="icon" aria-label="Helpful" onClick={(e) => { e.stopPropagation(); feedback.mutate(m.feedback === 1 ? 0 : 1); }}
            className={m.feedback === 1 ? "text-success" : ""}><ThumbsUp className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Not helpful" onClick={(e) => { e.stopPropagation(); feedback.mutate(m.feedback === -1 ? 0 : -1); }}
            className={m.feedback === -1 ? "text-danger" : ""}><ThumbsDown className="h-3.5 w-3.5" /></Button>
          {m.trace_id && <Link href={`/inspector?trace=${m.trace_id}`} className="ml-1 inline-flex items-center gap-1 text-[12px] hover:text-text"><FileSearch className="h-3.5 w-3.5" />Retrieval trace</Link>}
          {m.citations.length > 0 && <span className="ml-auto text-[11.5px]">{m.citations.length} sources{m.latency_ms ? ` · ${(m.latency_ms / 1000).toFixed(1)}s` : ""}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Main view */

export function WorkspaceView() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const chatFeature = useFeature("chat_answers");
  const activeId = params.get("c");

  const [filters, setFilters] = useState<ChatFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const tempCounter = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const conv = useQuery({
    queryKey: ["conversation", activeId],
    queryFn: () => api<ConversationDetail>(`/conversations/${activeId}`),
    enabled: !!activeId,
  });

  // Load the conversation's saved filters when switching conversations (adjust state during render).
  const [filtersFor, setFiltersFor] = useState<string | null>(null);
  if (conv.data && filtersFor !== conv.data.id) {
    setFiltersFor(conv.data.id);
    setFilters(normalizeFilters(conv.data.filters));
  }

  const messages = useMemo(() => {
    const persisted = conv.data?.messages ?? [];
    const ids = new Set(persisted.map((m) => m.id));
    return [...persisted, ...pending.filter((p) => !ids.has(p.id))];
  }, [conv.data, pending]);

  const selected = messages.find((m) => m.id === selectedId) ??
    [...messages].reverse().find((m) => m.role === "assistant") ?? null;

  const lastContent = messages.at(-1)?.content;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, lastContent]);

  function selectConversation(id: string | null) {
    abortRef.current?.abort();
    setPending([]);
    setSelectedId(null);
    setActiveCite(null);
    router.push(id ? `/workspace?c=${id}` : "/workspace");
  }

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || streaming) return;
    setDraft("");
    let cid = activeId;
    try {
      if (!cid) {
        const c = await api<Conversation>("/conversations", { method: "POST", body: { filters } });
        cid = c.id;
        router.replace(`/workspace?c=${cid}`);
      }
      setStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;
      const tempId = `tmp-${++tempCounter.current}`;
      setPending([{ id: tempId, conversation_id: cid, role: "user", content, status: "complete", query_type: null, citations: [],
        related_questions: [], trace_id: null, model: null, prompt_tokens: null, completion_tokens: null, cost_usd: null,
        latency_ms: null, feedback: null, error_code: null, created_at: new Date().toISOString() }]);

      await postSSE(`/conversations/${cid}/messages`, { content, filters }, (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === "user_message") {
          setPending([d.message as Message]);
        } else if (event === "assistant_message") {
          const msg = d.message as Message;
          setPending((p) => [...p, msg]);
          setSelectedId(msg.id);
        } else if (event === "token") {
          setPending((p) => p.map((m, i) => (i === p.length - 1 && m.role === "assistant" ? { ...m, content: m.content + (d.delta as string) } : m)));
        } else if (event === "citations") {
          setPending((p) => p.map((m, i) => (i === p.length - 1 && m.role === "assistant" ? { ...m, citations: d.citations as Message["citations"] } : m)));
        } else if (event === "related") {
          setPending((p) => p.map((m, i) => (i === p.length - 1 && m.role === "assistant" ? { ...m, related_questions: d.questions as string[] } : m)));
        } else if (event === "done") {
          const final = d.message as Message;
          setPending((p) => [...p.filter((m) => m.role === "user"), final]);
          setSelectedId(final.id);
        }
      }, ac.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast({ tone: "danger", title: "Message not sent", body: errorMessage(e) });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (cid) {
        await qc.invalidateQueries({ queryKey: ["conversation", cid] });
        setPending([]);
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
      taRef.current?.focus();
    }
  }

  function exportMarkdown() {
    if (!conv.data) return;
    const lines = [`# ${conv.data.title}`, "", `_Exported from EletsGPT 2.0 · ${fmtDateTime(new Date().toISOString())}_`, ""];
    for (const m of messages) {
      lines.push(m.role === "user" ? `## Question\n\n${m.content}\n` : `## Answer\n\n${m.content}\n`);
      if (m.citations.length) {
        lines.push("**Sources**\n");
        m.citations.forEach((c) => lines.push(`${c.index}. [${c.title}](${c.url})${c.published_at ? ` (${c.published_at.slice(0, 10)})` : ""}`));
        lines.push("");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${conv.data.title.replace(/[^\w-]+/g, "-").slice(0, 60) || "conversation"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const onCite = (msg: Message) => (n: number) => {
    setSelectedId(msg.id);
    setActiveCite(n);
    setEvidenceOpen(true);
  };

  const engineLive = chatFeature?.enabled;

  return (
    <div className="flex h-full">
      <aside className="hidden w-[260px] shrink-0 border-r border-border bg-surface md:block">
        <ConversationList activeId={activeId} onSelect={selectConversation} onNew={() => selectConversation(null)} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text">{conv.data?.title ?? "New conversation"}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span>Mode: Auto-routed hybrid RAG</span>
              {chatFeature && (engineLive
                ? <Badge tone="success">Live</Badge>
                : <Badge tone="warning" title={`${chatFeature.label} ships in Phase ${chatFeature.phase}`}>Engine: Phase {chatFeature.phase}</Badge>)}
              {filters.verticals.length > 0 && <span className="truncate">· {filters.verticals.map((v) => VERTICAL_LABELS[v]).join(", ")}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {conv.data && messages.length > 0 && <Button variant="ghost" size="sm" onClick={exportMarkdown}><Download className="h-3.5 w-3.5" />Export</Button>}
            <Button variant="ghost" size="sm" className="xl:hidden" onClick={() => setEvidenceOpen((o) => !o)}><PanelRightOpen className="h-3.5 w-3.5" />Evidence</Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <div className="mx-auto w-full max-w-[820px] px-5 py-6">
            {activeId && conv.isLoading ? (
              <div className="space-y-4"><Skeleton className="ml-auto h-10 w-2/3" /><Skeleton className="h-24 w-full" /></div>
            ) : activeId && conv.error ? (
              <EmptyState icon={<TriangleAlert className="h-5 w-5" />} title="Conversation unavailable" description={errorMessage(conv.error)}
                action={<Button size="sm" onClick={() => selectConversation(null)}>Start a new conversation</Button>} />
            ) : messages.length === 0 ? (
              <div className="pt-[6vh]">
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-card"><Sparkles className="h-5 w-5" /></div>
                  <h2 className="text-2xl font-semibold tracking-tight text-text">Hello{me ? `, ${me.full_name.split(" ")[0]}` : ""}. What would you like to know?</h2>
                  <p className="mx-auto mt-2 max-w-lg text-sm text-muted">Ask about Elets&apos; published coverage. Answers cite the original articles, PDF pages and video timestamps, and if the evidence isn&apos;t enough, the assistant says so.</p>
                </div>
                {!engineLive && chatFeature && (
                  <Callout tone="warning" className="mb-6" title="Answer engine not enabled yet">
                    The workspace is connected end-to-end: conversations are saved and requests are streamed. Retrieval and grounded
                    answers ship in Phases 3–4. Until then, questions receive an explicit &quot;not enabled&quot; reply, never a made-up answer.
                  </Callout>
                )}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-[13.5px] leading-snug text-text-2 shadow-card transition-colors hover:border-accent/40 hover:text-text">{s}</button>
                  ))}
                </div>
                <p className="mt-3 text-center text-[11.5px] text-muted">These are example prompts, not claims about Elets content.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m) => m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[640px] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] leading-relaxed text-white shadow-card">{m.content}</div>
                  </div>
                ) : (
                  <AssistantMessage key={m.id} m={m} conversationId={m.conversation_id} selected={selected?.id === m.id}
                    activeCite={activeCite} onSelect={() => setSelectedId(m.id)} onCite={onCite(m)} onAsk={(q) => send(q)} />
                ))}
                {streaming && !messages.some((m) => m.role === "assistant" && m.status === "streaming") && messages.at(-1)?.role === "user" && (
                  <div className="flex items-center gap-2 px-1 text-[13px] text-muted"><Spinner />Working on it…</div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface px-5 pb-4 pt-3">
          <div className="mx-auto w-full max-w-[820px]">
            <div className="rounded-2xl border border-border-strong bg-surface shadow-card focus-within:border-accent focus-within:ring-3 focus-within:ring-[var(--ring)]">
              <textarea ref={taRef} rows={1} value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 200) + "px"; }}
                placeholder="Ask about Elets coverage, events, people or organisations…" maxLength={4000}
                className="block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 text-[14.5px] text-text placeholder:text-muted focus:outline-none" />
              <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1.5">
                <FiltersBar value={filters} onChange={setFilters} />
                {streaming ? (
                  <Button size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop"><Square className="h-3.5 w-3.5" /></Button>
                ) : (
                  <Button size="icon" variant="primary" disabled={!draft.trim()} onClick={() => send()} aria-label="Send"><ArrowUp className="h-4 w-4" /></Button>
                )}
              </div>
            </div>
            <div className="mt-1.5 text-center text-[11px] text-muted">Answers are generated only from indexed Elets sources, and each citation links to its original record.</div>
          </div>
        </div>
      </section>

      <aside className={cn("w-[360px] shrink-0 border-l border-border bg-surface",
        evidenceOpen ? "fixed inset-y-0 right-0 z-30 shadow-pop xl:static xl:shadow-none" : "hidden xl:block")}>
        <EvidencePanel message={selected} activeCite={activeCite} onSelect={setActiveCite}
          onClose={evidenceOpen ? () => setEvidenceOpen(false) : undefined} />
      </aside>
    </div>
  );
}
