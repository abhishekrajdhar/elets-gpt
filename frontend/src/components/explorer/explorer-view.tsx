"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, Film, Library, Newspaper, Presentation, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageContainer } from "@/components/shell/app-shell";
import { Badge, Callout, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, SampleBadge, Select, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useFeature } from "@/lib/auth";
import { cn, DOC_TYPE_LABELS, ENTITY_LABELS, fmtDate, label, VERTICAL_LABELS } from "@/lib/format";
import type { DocumentItem, EntityRow, Facets, Page } from "@/lib/types";
import { Highlight } from "./highlight";

const DOC_ICONS: Record<string, typeof FileText> = {
  article: Newspaper, video: Film, pdf: FileText, magazine_issue: Library, event_page: Presentation, page: FileText,
};
const LIMIT = 20;

function FacetGroup({ title, items, selected, onToggle }: {
  title: string; items: { value: string; label: string; count: number }[]; selected: string[]; onToggle: (v: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{title}</div>
      <div className="space-y-0.5">
        {items.map((i) => {
          const on = selected.includes(i.value);
          return (
            <button key={i.value} onClick={() => onToggle(i.value)}
              className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                on ? "bg-accent-soft font-medium text-accent-text" : "text-text-2 hover:bg-surface-2")}>
              <span className="truncate">{i.label}</span>
              <span className="tabular-nums text-[11.5px] text-muted">{i.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EntityFacet({ type, selected, onToggle }: { type: string; selected: string[]; onToggle: (v: string) => void }) {
  const q = useQuery({
    queryKey: ["entities", type],
    queryFn: () => api<EntityRow[]>("/entities", { query: { entity_type: type, limit: 8 } }),
  });
  return (
    <FacetGroup title={`${ENTITY_LABELS[type]}s`} selected={selected} onToggle={onToggle}
      items={(q.data ?? []).map((e) => ({ value: e.id, label: e.name, count: e.document_count }))} />
  );
}

export function ExplorerView() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const kw = useFeature("keyword_document_search");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const state = {
    q: sp.get("q") ?? "",
    vertical: sp.getAll("vertical"),
    doc_type: sp.getAll("doc_type"),
    entity_id: sp.getAll("entity_id"),
    year: sp.get("year") ?? "",
    sort: sp.get("sort") ?? "relevance",
    offset: Number(sp.get("offset") ?? 0),
  };

  const [syncedQ, setSyncedQ] = useState(state.q);
  if (syncedQ !== state.q) {
    setSyncedQ(state.q);
    setQ(state.q);
  }

  function update(patch: Partial<Record<keyof typeof state, string | string[] | number>>) {
    const next = new URLSearchParams();
    const merged = { ...state, offset: 0, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
      else if (v !== "" && v !== 0 && !(k === "sort" && v === "relevance")) next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  const toggle = (key: "vertical" | "doc_type" | "entity_id") => (v: string) =>
    update({ [key]: state[key].includes(v) ? state[key].filter((x) => x !== v) : [...state[key], v] });

  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api<Facets>("/documents/facets") });
  const results = useQuery({
    queryKey: ["documents", state],
    placeholderData: keepPreviousData,
    queryFn: () => api<Page<DocumentItem>>("/documents", {
      query: {
        q: state.q, vertical: state.vertical, doc_type: state.doc_type, entity_id: state.entity_id,
        date_from: state.year ? `${state.year}-01-01` : undefined, date_to: state.year ? `${state.year}-12-31` : undefined,
        sort: state.sort === "relevance" && !state.q ? "newest" : state.sort, limit: LIMIT, offset: state.offset,
      },
    }),
  });

  const activeFilters = state.vertical.length + state.doc_type.length + state.entity_id.length + (state.year ? 1 : 0);
  const corpusEmpty = facets.data && facets.data.total === 0;
  const sampleCount = results.data?.items.filter((d) => d.is_sample).length ?? 0;

  return (
    <PageContainer>
      <PageHeader title="Knowledge Explorer"
        description="Search and browse every indexed Elets document. Open the original source, or inspect the chunks and metadata used for retrieval."
        eyebrow={kw?.enabled ? <Badge tone="info">Keyword search · Postgres full-text</Badge> : undefined} />

      <form onSubmit={(e) => { e.preventDefault(); update({ q }); }} className="relative mb-6">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search titles and full text — e.g. "digital public infrastructure" or telemedicine -covid'
          className="h-10 pl-10 pr-24 text-[14.5px]" />
        <div className="absolute right-2 top-1.5 flex gap-1">
          {q && <button type="button" onClick={() => { setQ(""); update({ q: "" }); }} className="rounded-md p-1.5 text-muted hover:text-text" aria-label="Clear"><X className="h-4 w-4" /></button>}
          <button type="submit" className="h-7 rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">Search</button>
        </div>
      </form>

      {corpusEmpty ? (
        <Card>
          <EmptyState icon={<Library className="h-5 w-5" />} title="No documents have been indexed yet"
            description={<>The knowledge base fills up when ingestion runs (Phase 2). Configured sources are listed under <Link href="/knowledge" className="text-accent-text hover:underline">Knowledge Management</Link>. For UI review, an operator can load clearly labelled sample data with <code className="rounded bg-surface-2 px-1">python -m app.cli seed-sample</code>.</>} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
          <button onClick={() => setFiltersOpen((o) => !o)}
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-medium text-text-2 lg:hidden">
            <span>Filters{activeFilters ? ` (${activeFilters})` : ""}</span><span className="text-muted">{filtersOpen ? "Hide" : "Show"}</span>
          </button>
          <aside className={cn("space-y-5", !filtersOpen && "hidden lg:block")}>
            {facets.isLoading ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7" />)}</div> : facets.data && (
              <>
                <FacetGroup title="Vertical" selected={state.vertical} onToggle={toggle("vertical")}
                  items={facets.data.verticals.map((b) => ({ value: b.value, label: label(VERTICAL_LABELS, b.value), count: b.count }))} />
                <FacetGroup title="Content type" selected={state.doc_type} onToggle={toggle("doc_type")}
                  items={facets.data.doc_types.map((b) => ({ value: b.value, label: label(DOC_TYPE_LABELS, b.value), count: b.count }))} />
                <FacetGroup title="Publication year" selected={state.year ? [state.year] : []}
                  onToggle={(y) => update({ year: state.year === y ? "" : y })}
                  items={facets.data.years.map((b) => ({ value: b.value, label: b.value, count: b.count }))} />
                <EntityFacet type="organisation" selected={state.entity_id} onToggle={toggle("entity_id")} />
                <EntityFacet type="event" selected={state.entity_id} onToggle={toggle("entity_id")} />
                <EntityFacet type="topic" selected={state.entity_id} onToggle={toggle("entity_id")} />
              </>
            )}
          </aside>

          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[13px] text-muted">
                {results.data ? <><span className="font-medium tabular-nums text-text">{results.data.total.toLocaleString()}</span> documents{state.q && <> matching &ldquo;{state.q}&rdquo;</>}</> : " "}
                {activeFilters > 0 && <button onClick={() => update({ vertical: [], doc_type: [], entity_id: [], year: "" })} className="ml-2 text-accent-text hover:underline">Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}</button>}
              </div>
              <Select value={state.sort} onChange={(e) => update({ sort: e.target.value })} className="h-8 w-auto text-[13px]">
                <option value="relevance">Most relevant</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </Select>
            </div>
            {sampleCount > 0 && (
              <Callout tone="sample" className="mb-3" title="Sample data present">
                Results marked SAMPLE are fictional fixtures for UI review. Their URLs use the reserved <code>.invalid</code> domain and aren&apos;t Elets content.
              </Callout>
            )}
            <Card className={cn("divide-y divide-border", results.isFetching && "opacity-80")}>
              {results.isLoading ? (
                <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
              ) : results.error ? (
                <ErrorState error={results.error} onRetry={() => results.refetch()} />
              ) : !results.data?.items.length ? (
                <EmptyState icon={<Search className="h-5 w-5" />} title="No matching documents"
                  description="Try fewer words, different spellings, or remove filters. Search uses English stemming and supports quoted phrases and -exclusions." />
              ) : results.data.items.map((d) => {
                const Icon = DOC_ICONS[d.doc_type] ?? FileText;
                return (
                  <Link key={d.id} href={`/explorer/${d.id}`} className="flex gap-4 px-5 py-4 transition-colors hover:bg-surface-2/60">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14.5px] font-medium leading-snug text-text">{d.title}</span>
                        {d.is_sample && <SampleBadge />}
                        {d.access_level !== "public" && <Badge tone="warning">{d.access_level}</Badge>}
                        {d.status !== "active" && <Badge tone="danger">{d.status}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                        <Badge tone="accent">{label(VERTICAL_LABELS, d.vertical)}</Badge>
                        <span>{label(DOC_TYPE_LABELS, d.doc_type)}</span>
                        <span>·</span><span>{d.source_name}</span>
                        {d.published_at && <><span>·</span><span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fmtDate(d.published_at)}</span></>}
                        {d.author && <><span>·</span><span>{d.author}</span></>}
                      </div>
                      {d.snippet && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-2"><Highlight text={d.snippet} /></p>}
                    </div>
                  </Link>
                );
              })}
              {results.data && <Pagination total={results.data.total} limit={LIMIT} offset={state.offset} onChange={(o) => update({ offset: o })} />}
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
