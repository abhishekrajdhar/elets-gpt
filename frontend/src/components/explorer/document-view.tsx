"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Hash, Layers, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { PageContainer } from "@/components/shell/app-shell";
import {
  Badge, Button, Callout, Card, CardHeader, EmptyState, ErrorState, KeyValue, Pagination, SampleBadge, Select, Skeleton, Tabs, useToast,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { DOC_TYPE_LABELS, ENTITY_LABELS, fmtDate, fmtDateTime, fmtNum, fmtTimestamp, label, VERTICAL_LABELS } from "@/lib/format";
import type { ChunkRow, DocumentDetail, Page } from "@/lib/types";

function ChunksTab({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const [inactive, setInactive] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["chunks", id, offset, inactive],
    queryFn: () => api<Page<ChunkRow>>(`/documents/${id}/chunks`, { query: { offset, limit: 25, include_inactive: inactive } }),
  });
  if (q.isLoading) return <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5 text-[12.5px] text-muted">
        <span>{q.data!.total} chunk{q.data!.total === 1 ? "" : "s"}</span>
        <label className="flex items-center gap-2"><input type="checkbox" checked={inactive} onChange={(e) => { setInactive(e.target.checked); setOffset(0); }} />Include superseded versions</label>
      </div>
      {!q.data!.items.length ? (
        <EmptyState icon={<Layers className="h-5 w-5" />} title="No chunks yet" description="Chunks are created by the indexing pipeline in Phase 3." />
      ) : q.data!.items.map((c) => (
        <div key={c.id} className="border-b border-border px-5 py-3.5 last:border-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            <Badge><Hash className="h-3 w-3" />{c.chunk_index}</Badge>
            <span>v{c.document_version}</span>
            <span>· {c.token_count} tokens</span>
            {c.page_number != null && <Badge tone="info">page {c.page_number}</Badge>}
            {c.timestamp_start != null && <Badge tone="info">{fmtTimestamp(c.timestamp_start)}–{fmtTimestamp(c.timestamp_end)}</Badge>}
            {!c.is_active && <Badge tone="danger">inactive</Badge>}
            {c.embedding_models.length ? c.embedding_models.map((m) => <Badge key={m} tone="success">{m}</Badge>) : <Badge tone="warning">not embedded</Badge>}
            <button onClick={() => setOpen(open === c.id ? null : c.id)} className="ml-auto text-accent-text hover:underline">{open === c.id ? "Hide metadata" : "Metadata"}</button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-text-2">{c.text}</p>
          {open === c.id && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11.5px] text-text-2 scroll-thin">{JSON.stringify({
              id: c.id, context_prefix: c.context_prefix, section_heading: c.section_heading, char_start: c.char_start, char_end: c.char_end,
              content_hash: c.content_hash, metadata: c.metadata, created_at: c.created_at,
            }, null, 2)}</pre>
          )}
        </div>
      ))}
      <Pagination total={q.data!.total} limit={25} offset={offset} onChange={setOffset} />
    </div>
  );
}

export function DocumentView() {
  const { documentId } = useParams<{ documentId: string }>();
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"content" | "chunks" | "metadata">("content");
  const q = useQuery({ queryKey: ["document", documentId], queryFn: () => api<DocumentDetail>(`/documents/${documentId}`) });
  const patch = useMutation({
    mutationFn: (body: Record<string, string>) => api<DocumentDetail>(`/documents/${documentId}`, { method: "PATCH", body }),
    onSuccess: (d) => { qc.setQueryData(["document", documentId], d); qc.invalidateQueries({ queryKey: ["documents"] }); toast({ tone: "success", title: "Document updated" }); },
    onError: (e) => toast({ tone: "danger", title: "Update failed", body: errorMessage(e) }),
  });
  const reprocess = useMutation({
    mutationFn: () => api(`/documents/${documentId}/reprocess`, { method: "POST" }),
    onError: (e) => toast({ tone: "warning", title: "Reprocessing unavailable", body: errorMessage(e) }),
  });

  if (q.isLoading) return <PageContainer><Skeleton className="mb-4 h-8 w-2/3" /><Skeleton className="h-64" /></PageContainer>;
  if (q.error) return <PageContainer><Card><ErrorState error={q.error} /></Card></PageContainer>;
  const d = q.data!;
  const entityGroups = d.entities.reduce<Record<string, typeof d.entities>>((acc, e) => ((acc[e.entity_type] ??= []).push(e), acc), {});

  return (
    <PageContainer>
      <Link href="/explorer" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"><ArrowLeft className="h-3.5 w-3.5" />Back to explorer</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{label(VERTICAL_LABELS, d.vertical)}</Badge>
            <Badge>{label(DOC_TYPE_LABELS, d.doc_type)}</Badge>
            {d.is_sample && <SampleBadge />}
            {d.access_level !== "public" && <Badge tone="warning">{d.access_level}</Badge>}
            {d.status !== "active" && <Badge tone="danger">{d.status}</Badge>}
          </div>
          <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-text">{d.title}</h1>
          <div className="mt-1.5 text-[13px] text-muted">{d.source_name}{d.published_at && ` · ${fmtDate(d.published_at)}`}{d.author && ` · ${d.author}`}</div>
        </div>
        <div className="flex gap-2">
          <a href={d.canonical_url} target="_blank" rel="noopener noreferrer"><Button variant="primary"><ExternalLink className="h-4 w-4" />Open original</Button></a>
        </div>
      </div>

      {d.is_sample && <Callout tone="sample" className="mb-5" title="This is fictional sample data">It exists only for UI review and is not Elets content. Remove it with <code>python -m app.cli purge-sample</code>.</Callout>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <Tabs className="px-3" value={tab} onChange={setTab} items={[
            { value: "content", label: "Content" },
            { value: "chunks", label: "Indexed chunks", count: d.active_chunk_count },
            { value: "metadata", label: "Raw metadata" },
          ]} />
          {tab === "content" && (
            <div className="px-6 py-5">
              {d.summary && <p className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-[13.5px] leading-relaxed text-text-2"><span className="font-medium text-text">Summary: </span>{d.summary}</p>}
              <div className="whitespace-pre-wrap text-[14px] leading-[1.75] text-text-2">{d.content_text || "No text was extracted."}</div>
            </div>
          )}
          {tab === "chunks" && <ChunksTab id={d.id} />}
          {tab === "metadata" && <pre className="overflow-x-auto p-5 font-mono text-[12px] text-text-2 scroll-thin">{JSON.stringify(d.metadata, null, 2)}</pre>}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Provenance" />
            <div className="p-5">
              <KeyValue items={[
                ["Original URL", <a key="u" href={d.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent-text hover:underline">{d.url}</a>],
                ["Canonical", d.canonical_url !== d.url ? <span className="break-all">{d.canonical_url}</span> : "Same as original"],
                ["Source", d.source_name],
                ["Published", fmtDate(d.published_at)],
                ["Source updated", fmtDate(d.source_updated_at)],
                ["Indexed", fmtDateTime(d.created_at)],
                ["Version", `v${d.version} (${d.version_count} prior)`],
                ["Words", fmtNum(d.word_count)],
                ...(d.page_count ? [["Pages", d.page_count] as [string, number]] : []),
                ...(d.video_id ? [["Video", `${d.video_id}${d.duration_seconds ? ` · ${fmtTimestamp(d.duration_seconds)}` : ""}`] as [string, string]] : []),
                ...(d.event_name ? [["Event", `${d.event_name}${d.event_date ? ` · ${fmtDate(d.event_date)}` : ""}`] as [string, string]] : []),
                ["Embeddings", d.embedding_models.length ? d.embedding_models.join(", ") : "None yet"],
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Entities" description="Organisations, people, events and topics linked to this document" />
            <div className="space-y-3 p-5">
              {!d.entities.length ? <div className="text-[13px] text-muted">No entities extracted.</div> :
                Object.entries(entityGroups).map(([type, ents]) => (
                  <div key={type}>
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{label(ENTITY_LABELS, type)}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ents.map((e) => (
                        <Link key={e.id + e.role} href={`/explorer?entity_id=${e.id}`}
                          className="rounded-md border border-border px-2 py-1 text-[12.5px] text-text-2 hover:border-accent/40 hover:text-accent-text"
                          title={e.designation ?? e.role}>
                          {e.name}{e.designation && <span className="text-muted"> · {e.designation}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
          {can("knowledge:manage") && (
            <Card>
              <CardHeader title="Manage" description="Changes are audited. Documents are never hard-deleted." />
              <div className="space-y-3 p-5">
                <label className="block text-[12.5px] text-muted">Status
                  <Select className="mt-1" value={d.status} disabled={patch.isPending} onChange={(e) => patch.mutate({ status: e.target.value })}>
                    {["active", "deleted", "duplicate", "superseded", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </label>
                <label className="block text-[12.5px] text-muted">Access level
                  <Select className="mt-1" value={d.access_level} disabled={patch.isPending} onChange={(e) => patch.mutate({ access_level: e.target.value })}>
                    {["public", "internal", "restricted"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </label>
                <Button className="w-full" loading={reprocess.isPending} onClick={() => reprocess.mutate()}><RefreshCcw className="h-4 w-4" />Reprocess document</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
