"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, KeyRound, Pencil, Play, Plus, ScrollText, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageContainer } from "@/components/shell/app-shell";
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, NotEnabled, PageHeader, Pagination, SampleBadge, Select, Skeleton,
  Stat, Switch, Table, Tabs, Td, Th, useToast,
} from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useCan, useFeature } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtNum, label, relTime, SOURCE_TYPE_LABELS, VERTICAL_LABELS } from "@/lib/format";
import type { DocumentItem, IndexHealth, Job, LogRow, Page, Source } from "@/lib/types";
import { SourceDialog } from "./source-dialog";

type Tab = "sources" | "jobs" | "documents" | "health" | "logs";

const JOB_TONE: Record<string, "success" | "danger" | "info" | "warning" | "neutral"> = {
  succeeded: "success", failed: "danger", running: "info", queued: "neutral", partial: "warning", cancelled: "neutral",
};

function SourcesTab() {
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const worker = useFeature("ingestion_worker");
  const [editing, setEditing] = useState<Source | null>(null);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["sources"], queryFn: () => api<Source[]>("/sources") });
  const manage = can("sources:manage");
  const toggle = useMutation({
    mutationFn: (s: Source) => api(`/sources/${s.id}`, { method: "PATCH", body: { enabled: !s.enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
    onError: (e) => toast({ tone: "danger", title: "Update failed", body: errorMessage(e) }),
  });
  const runNow = useMutation({
    mutationFn: (s: Source) => api(`/sources/${s.id}/jobs`, { method: "POST", body: { job_type: "incremental" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); toast({ tone: "success", title: "Ingestion job queued" }); },
    onError: (e) => toast({ tone: e instanceof ApiError && e.isEngineNotReady ? "warning" : "danger",
      title: e instanceof ApiError && e.isEngineNotReady ? "Ingestion worker not enabled yet" : "Couldn't start job", body: errorMessage(e) }),
  });

  return (
    <>
      {worker && !worker.enabled && (
        <NotEnabled feature="Crawling & ingestion" phase={worker.phase}>
          The registry, schedules and crawl rules can already be configured. &quot;Run now&quot; is refused until the worker exists, so no phantom jobs are queued.
        </NotEnabled>
      )}
      <Card className="mt-4">
        <CardHeader title="Source registry" description="Initial Elets sources are candidates. Phase 2 probe jobs record what is actually reachable."
          actions={manage && <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" />Add source</Button>} />
        {q.isLoading ? <div className="p-5"><Skeleton className="h-40" /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data!.length ? (
          <EmptyState icon={<Database className="h-5 w-5" />} title="No sources registered" />
        ) : (
          <Table>
            <thead><tr><Th>Source</Th><Th>Type</Th><Th>Vertical</Th><Th>Schedule</Th><Th className="text-right">Documents</Th><Th className="text-right">Failed URLs</Th><Th>Last crawl</Th><Th>Enabled</Th><Th /></tr></thead>
            <tbody>
              {q.data!.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2/40">
                  <Td>
                    <div className="flex items-center gap-1.5 font-medium text-text">{s.name}{s.slug === "sample-data" && <SampleBadge />}</div>
                    <a href={s.base_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted hover:text-accent-text hover:underline">{s.base_url.replace(/^https?:\/\//, "")}</a>
                    {!s.credentials_configured && <div className="mt-1 flex items-center gap-1 text-[11.5px] text-warning"><KeyRound className="h-3 w-3" />Needs {s.requires_credentials.join(", ")}</div>}
                  </Td>
                  <Td>{label(SOURCE_TYPE_LABELS, s.source_type)}</Td>
                  <Td><Badge tone="accent">{label(VERTICAL_LABELS, s.vertical)}</Badge></Td>
                  <Td className="whitespace-nowrap font-mono text-[12px]">{s.schedule_cron ?? <span className="font-sans text-muted">manual</span>}</Td>
                  <Td className="text-right tabular-nums">{fmtNum(s.document_count)}</Td>
                  <Td className="text-right tabular-nums">{s.failed_url_count ? <span className="text-danger">{s.failed_url_count}</span> : "0"}</Td>
                  <Td>{s.latest_job ? <span className="flex items-center gap-1.5"><Badge tone={JOB_TONE[s.latest_job.status]}>{s.latest_job.status}</Badge><span className="text-[12px] text-muted">{relTime(s.latest_job.created_at)}</span></span> : <span className="text-[12.5px] text-muted">Never</span>}</Td>
                  <Td><Switch checked={s.enabled} disabled={!manage || toggle.isPending} onChange={() => toggle.mutate(s)} label={`Enable ${s.name}`} /></Td>
                  <Td className="whitespace-nowrap text-right">
                    {manage && <>
                      <Button variant="ghost" size="sm" onClick={() => runNow.mutate(s)} disabled={!s.enabled} title={worker?.enabled ? "Start an incremental crawl" : `Ingestion worker ships in Phase ${worker?.phase}`}><Play className="h-3.5 w-3.5" />Run</Button>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    </>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {open && <SourceDialog key={editing?.id ?? "new"} open onClose={() => setOpen(false)} source={editing} />}
    </>
  );
}

function JobsTab() {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ["jobs", status, offset], placeholderData: keepPreviousData,
    queryFn: () => api<Page<Job>>("/jobs", { query: { status, offset, limit: 25 } }) });
  return (
    <Card>
      <CardHeader title="Ingestion jobs" description="Discovery, crawl, reindex, YouTube and PDF jobs with live statistics"
        actions={<Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="h-8 w-36 text-[13px]">
          <option value="">All statuses</option>{Object.keys(JOB_TONE).map((s) => <option key={s} value={s}>{s}</option>)}</Select>} />
      {q.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : q.error ? <ErrorState error={q.error} /> : !q.data!.items.length ? (
        <EmptyState icon={<Workflow className="h-5 w-5" />} title="No ingestion jobs yet"
          description="Jobs appear here when a source is crawled on its schedule or run manually. The ingestion worker ships in Phase 2." />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Source</Th><Th>Type</Th><Th>Trigger</Th><Th>Status</Th><Th className="text-right">Fetched</Th><Th className="text-right">New</Th><Th className="text-right">Updated</Th><Th className="text-right">Failed</Th><Th>Started</Th><Th>Finished</Th></tr></thead>
            <tbody>{q.data!.items.map((j) => (
              <tr key={j.id}>
                <Td className="text-text">{j.source_name}</Td><Td>{j.job_type}</Td><Td>{j.trigger}</Td>
                <Td><Badge tone={JOB_TONE[j.status]}>{j.status}</Badge>{j.error && <div className="mt-1 max-w-[220px] truncate text-[11px] text-danger" title={j.error}>{j.error}</div>}</Td>
                {["fetched", "new", "updated", "failed"].map((k) => <Td key={k} className="text-right tabular-nums">{fmtNum(j.stats?.[k] ?? 0)}</Td>)}
                <Td className="text-[12.5px]">{fmtDateTime(j.started_at)}</Td><Td className="text-[12.5px]">{fmtDateTime(j.finished_at)}</Td>
              </tr>))}</tbody>
          </Table>
          <Pagination total={q.data!.total} limit={25} offset={offset} onChange={setOffset} />
        </>
      )}
    </Card>
  );
}

function DocumentsTab() {
  const can = useCan();
  const [status, setStatus] = useState("active");
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ["documents", "manage", status, offset], placeholderData: keepPreviousData,
    queryFn: () => api<Page<DocumentItem>>("/documents", { query: { status: status ? [status] : [], sort: "newest", limit: 25, offset } }) });
  return (
    <Card>
      <CardHeader title="Documents" description="Every indexed record with its status. Deleting is a soft status change, so provenance is kept."
        actions={can("knowledge:manage") && <Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="h-8 w-40 text-[13px]">
          {["active", "duplicate", "failed", "superseded", "deleted"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>} />
      {q.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : q.error ? <ErrorState error={q.error} /> : !q.data!.items.length ? (
        <EmptyState icon={<ScrollText className="h-5 w-5" />} title={`No ${status} documents`} />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Title</Th><Th>Source</Th><Th>Vertical</Th><Th>Access</Th><Th>Published</Th><Th className="text-right">Words</Th></tr></thead>
            <tbody>{q.data!.items.map((d) => (
              <tr key={d.id} className="hover:bg-surface-2/40">
                <Td className="max-w-[420px]"><Link href={`/explorer/${d.id}`} className="line-clamp-1 font-medium text-text hover:underline">{d.title}</Link>{d.is_sample && <SampleBadge />}</Td>
                <Td>{d.source_name}</Td><Td>{label(VERTICAL_LABELS, d.vertical)}</Td>
                <Td><Badge tone={d.access_level === "public" ? "neutral" : "warning"}>{d.access_level}</Badge></Td>
                <Td>{fmtDate(d.published_at)}</Td><Td className="text-right tabular-nums">{fmtNum(d.word_count)}</Td>
              </tr>))}</tbody>
          </Table>
          <Pagination total={q.data!.total} limit={25} offset={offset} onChange={setOffset} />
        </>
      )}
    </Card>
  );
}

function HealthTab() {
  const q = useQuery({ queryKey: ["index-health"], queryFn: () => api<IndexHealth>("/knowledge/index-health") });
  const emb = useFeature("embeddings");
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.error) return <Card><ErrorState error={q.error} /></Card>;
  const h = q.data!;
  const bs = h.documents.by_status;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active documents" value={fmtNum(h.documents.active)} hint={h.documents.sample ? `${h.documents.sample} sample` : undefined} />
        <Stat label="Active chunks" value={fmtNum(h.chunks.active)} hint={`${fmtNum(h.chunks.total - h.chunks.active)} superseded`} />
        <Stat label="Documents without chunks" value={fmtNum(h.documents.without_chunks)} hint="Need (re)indexing" />
        <Stat label="Failed URLs" value={fmtNum(h.failed_urls)} hint="Awaiting retry or review" />
        <Stat label="Duplicates" value={fmtNum(bs.duplicate ?? 0)} hint="Kept for provenance" />
        <Stat label="Failed documents" value={fmtNum(bs.failed ?? 0)} />
        <Stat label="Soft-deleted" value={fmtNum(bs.deleted ?? 0)} hint="Excluded from retrieval" />
        <Stat label="Crawl frontier" value={fmtNum(Object.values(h.crawl_urls).reduce((a, b) => a + b, 0))} hint="Known URLs" />
      </div>
      <Card>
        <CardHeader title="Embedding coverage" description="Share of active chunks embedded by each model" />
        {!h.embeddings.length ? (
          <div className="flex items-center gap-2 px-5 py-5 text-[13px] text-muted"><AlertTriangle className="h-4 w-4 text-warning" />
            No embeddings yet.{emb && !emb.enabled && ` Chunking and embeddings ship in Phase ${emb.phase}.`}</div>
        ) : (
          <Table><thead><tr><Th>Model</Th><Th>Dimension</Th><Th className="text-right">Chunks</Th><Th className="text-right">Coverage</Th></tr></thead>
            <tbody>{h.embeddings.map((e) => <tr key={e.model}><Td className="font-mono text-[12.5px] text-text">{e.model}</Td><Td>{e.dim}</Td><Td className="text-right tabular-nums">{fmtNum(e.chunks)}</Td>
              <Td className="text-right tabular-nums">{e.coverage == null ? "—" : `${(e.coverage * 100).toFixed(1)}%`}</Td></tr>)}</tbody></Table>
        )}
      </Card>
    </div>
  );
}

function LogsTab() {
  const [level, setLevel] = useState("");
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ["ingestion-logs", level, offset], placeholderData: keepPreviousData,
    queryFn: () => api<Page<LogRow>>("/ingestion/logs", { query: { level, offset, limit: 50 } }) });
  return (
    <Card>
      <CardHeader title="Processing logs" description="Per-URL ingestion events: fetches, robots decisions, extraction and errors"
        actions={<Select value={level} onChange={(e) => { setLevel(e.target.value); setOffset(0); }} className="h-8 w-32 text-[13px]">
          <option value="">All levels</option>{["debug", "info", "warning", "error"].map((l) => <option key={l}>{l}</option>)}</Select>} />
      {q.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : q.error ? <ErrorState error={q.error} /> : !q.data!.items.length ? (
        <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No log entries" description="Logs are written by ingestion jobs (Phase 2)." />
      ) : (
        <>
          <div className="divide-y divide-border font-mono text-[12px]">
            {q.data!.items.map((l) => (
              <div key={l.id} className="flex gap-3 px-5 py-2">
                <span className="shrink-0 text-muted">{fmtDateTime(l.created_at)}</span>
                <Badge tone={l.level === "error" ? "danger" : l.level === "warning" ? "warning" : "neutral"}>{l.level}</Badge>
                <span className="min-w-0 break-words text-text-2">{l.message}{l.url && <span className="text-muted"> · {l.url}</span>}</span>
              </div>
            ))}
          </div>
          <Pagination total={q.data!.total} limit={50} offset={offset} onChange={setOffset} />
        </>
      )}
    </Card>
  );
}

export function KnowledgeView() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (sp.get("tab") as Tab) ?? "sources";
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });
  return (
    <PageContainer>
      <PageHeader title="Knowledge Management" description="Sources, ingestion jobs, documents, index health and processing logs. All figures come from the live database." />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "sources", label: "Sources" }, { value: "jobs", label: "Ingestion jobs" }, { value: "documents", label: "Documents" },
        { value: "health", label: "Index health" }, { value: "logs", label: "Logs" },
      ]} />
      {tab === "sources" && <SourcesTab />}
      {tab === "jobs" && <JobsTab />}
      {tab === "documents" && <DocumentsTab />}
      {tab === "health" && <HealthTab />}
      {tab === "logs" && <LogsTab />}
    </PageContainer>
  );
}
