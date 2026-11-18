"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Binary, Combine, FileCheck2, Filter, ListOrdered, Play, ScanSearch, SearchCode, ShieldCheck, TextSearch } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { PageContainer } from "@/components/shell/app-shell";
import {
  Badge, Button, Callout, Card, CardHeader, EmptyState, ErrorState, Forbidden, Input, PageHeader, Select, Skeleton, Table, Td, Th,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useCan, useFeature } from "@/lib/auth";
import { cn, fmtDateTime, fmtNum, VERTICAL_LABELS } from "@/lib/format";
import type { PipelineInfo, TraceSummary, Vertical } from "@/lib/types";

const STAGE_ICONS: Record<string, typeof Binary> = {
  classify: Filter, dense: Binary, lexical: TextSearch, fusion: Combine, rerank: ListOrdered, evidence: FileCheck2, citations: ShieldCheck,
};

function stageParams(key: string, cfg: PipelineInfo["config"]): [string, string][] {
  const r = cfg.retrieval, rr = cfg.reranker, e = cfg.embedding;
  switch (key) {
    case "classify": return [["Mode", String(r.classifier_mode)]];
    case "dense": return [["Model", String(e.model)], ["Top-k", String(r.dense_top_k)], ["Dim", String(e.dimension)]];
    case "lexical": return [["Engine", "Postgres FTS"], ["Top-k", String(r.lexical_top_k)]];
    case "fusion": return [["RRF k", String(r.rrf_k)], ["Weights", `${r.rrf_weight_dense} / ${r.rrf_weight_lexical}`]];
    case "rerank": return [["Model", rr.enabled ? String(rr.model) : "disabled"], ["Top-n", String(rr.top_n)]];
    case "evidence": return [["Final k", String(r.final_context_k)], ["Per-doc cap", String(r.per_document_cap)], ["Tokens", String(r.max_context_tokens)]];
    case "citations": return [["Abstain <", String(r.abstain_threshold)]];
    default: return [];
  }
}

function StageCard({ stage, cfg, live }: { stage: PipelineInfo["stages"][number]; cfg: PipelineInfo["config"]; live: boolean }) {
  const Icon = STAGE_ICONS[stage.key] ?? ScanSearch;
  return (
    <div className="min-w-[150px] flex-1 rounded-xl border border-border bg-surface p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-text"><Icon className="h-3.5 w-3.5" /></span>
        {live ? <Badge tone="success">Live</Badge> : <Badge tone="warning">Phase {stage.phase}</Badge>}
      </div>
      <div className="mt-2.5 text-[13px] font-semibold leading-tight text-text">{stage.label}</div>
      <dl className="mt-2 space-y-1">
        {stageParams(stage.key, cfg).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-[11.5px]"><dt className="text-muted">{k}</dt><dd className="truncate font-mono text-text-2" title={v}>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

type ResultRow = { rank?: number; chunk_id?: string; document_id?: string; title?: string; score?: number; rrf_score?: number;
  rerank_score?: number; lanes?: Record<string, number>; verified?: boolean; reason?: string; [k: string]: unknown };

function ResultTable({ title, icon, rows, scoreKeys }: { title: string; icon: ReactNode; rows: ResultRow[]; scoreKeys: string[] }) {
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2">{icon}{title}</span>} description={`${rows.length} results`} />
      {!rows.length ? <div className="px-5 py-6 text-[13px] text-muted">No results recorded for this stage.</div> : (
        <Table>
          <thead><tr><Th>#</Th><Th>Document</Th>{scoreKeys.map((k) => <Th key={k} className="text-right">{k.replace(/_/g, " ")}</Th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={`${r.chunk_id ?? i}`}>
                <Td className="tabular-nums text-muted">{r.rank ?? i + 1}</Td>
                <Td className="max-w-[420px]">
                  {r.document_id ? <Link href={`/explorer/${r.document_id}`} className="line-clamp-1 text-text hover:underline">{r.title ?? r.document_id}</Link> : <span>{r.title ?? "—"}</span>}
                  {r.chunk_id && <div className="font-mono text-[10.5px] text-muted">{r.chunk_id}</div>}
                </Td>
                {scoreKeys.map((k) => <Td key={k} className="text-right font-mono tabular-nums">{typeof r[k] === "number" ? (r[k] as number).toFixed(4) : String(r[k] ?? "—")}</Td>)}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function TraceDetail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["trace", id], queryFn: () => api<Record<string, unknown>>(`/retrieval/traces/${id}`) });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <Card><ErrorState error={q.error} /></Card>;
  const t = q.data!;
  const arr = (k: string) => (t[k] as ResultRow[]) ?? [];
  const timings = (t.timings as Record<string, number>) ?? {};
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Query</div>
        <div className="mt-1 text-[15px] font-medium text-text">{String(t.query)}</div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          {t.query_type ? <Badge tone="accent">{String(t.query_type)}</Badge> : null}
          <Badge>{fmtNum(t.total_latency_ms as number)} ms total</Badge>
          {Object.entries(timings).map(([k, v]) => <Badge key={k}>{k}: {fmtNum(v)} ms</Badge>)}
        </div>
        {!!t.classification && Object.keys(t.classification as object).length > 0 && (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11.5px] text-text-2">{JSON.stringify(t.classification, null, 2)}</pre>
        )}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <ResultTable title="Dense results" icon={<Binary className="h-4 w-4 text-muted" />} rows={arr("dense_results")} scoreKeys={["score"]} />
        <ResultTable title="BM25 / FTS results" icon={<TextSearch className="h-4 w-4 text-muted" />} rows={arr("lexical_results")} scoreKeys={["score"]} />
      </div>
      <ResultTable title="RRF fused ranking" icon={<Combine className="h-4 w-4 text-muted" />} rows={arr("fused_results")} scoreKeys={["rrf_score"]} />
      <ResultTable title="Reranked" icon={<ListOrdered className="h-4 w-4 text-muted" />} rows={arr("reranked_results")} scoreKeys={["rerank_score", "rrf_score"]} />
      <ResultTable title="Final evidence" icon={<FileCheck2 className="h-4 w-4 text-muted" />} rows={arr("final_evidence")} scoreKeys={["rerank_score"]} />
      <ResultTable title="Citation verification" icon={<ShieldCheck className="h-4 w-4 text-muted" />} rows={arr("citation_checks")} scoreKeys={["verified", "reason"]} />
    </div>
  );
}

export function InspectorView() {
  const can = useCan();
  const router = useRouter();
  const sp = useSearchParams();
  const traceId = sp.get("trace");
  const retrieval = useFeature("hybrid_retrieval");
  const [query, setQuery] = useState("");
  const [vertical, setVertical] = useState<string>("");

  const pipeline = useQuery({ queryKey: ["pipeline"], queryFn: () => api<PipelineInfo>("/retrieval/pipeline"), enabled: can("inspector:use") });
  const traces = useQuery({
    queryKey: ["traces"],
    queryFn: () => api<{ items: TraceSummary[]; total: number }>("/retrieval/traces"),
    enabled: can("inspector:use"),
  });
  const run = useMutation({
    mutationFn: () => api<{ id: string }>("/retrieval/inspect", {
      method: "POST", body: { query, filters: { verticals: vertical ? [vertical as Vertical] : [], date_from: null, date_to: null, doc_types: [] } },
    }),
    onSuccess: (t) => router.push(`/inspector?trace=${t.id}`),
  });

  if (!can("inspector:use")) return <PageContainer><Card><Forbidden permission="inspector:use" /></Card></PageContainer>;
  const runError = run.error instanceof ApiError ? run.error : null;

  return (
    <PageContainer>
      <PageHeader title="Retrieval Inspector"
        description="Follow a query through each retrieval stage: classification, dense and BM25 lanes, reciprocal rank fusion, reranking, evidence selection and citation checks." />

      <Card className="mb-6 p-4">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={(e) => { e.preventDefault(); if (query.trim()) run.mutate(); }}>
          <div className="relative flex-1">
            <SearchCode className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter a question to trace through the pipeline" className="pl-9" maxLength={4000} />
          </div>
          <Select value={vertical} onChange={(e) => setVertical(e.target.value)} className="md:w-48">
            <option value="">All verticals</option>
            {Object.entries(VERTICAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button type="submit" variant="primary" loading={run.isPending} disabled={!query.trim()}><Play className="h-4 w-4" />Run trace</Button>
        </form>
        {runError?.isEngineNotReady && (
          <Callout tone="warning" className="mt-3" title="Retrieval engine not enabled yet">
            {runError.message} This request reached the API and was refused honestly. No results were simulated.
          </Callout>
        )}
        {run.error && !runError?.isEngineNotReady && <Callout tone="danger" className="mt-3">{(run.error as Error).message}</Callout>}
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Pipeline</h2>
        <span className="text-[12px] text-muted">Parameters reflect current Admin → Retrieval settings</span>
      </div>
      {pipeline.isLoading ? <Skeleton className="mb-8 h-36" /> : pipeline.data && (
        <div className="mb-8 flex items-stretch gap-2 overflow-x-auto pb-2 scroll-thin">
          {pipeline.data.stages.map((s, i) => (
            <div key={s.key} className="flex items-stretch gap-2">
              <StageCard stage={s} cfg={pipeline.data.config} live={!!retrieval?.enabled && s.phase <= 3} />
              {i < pipeline.data.stages.length - 1 && <ArrowRight className={cn("h-4 w-4 shrink-0 self-center text-border-strong")} />}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Recent traces" description={traces.data ? `${traces.data.total} recorded` : undefined} />
          {traces.isLoading ? <div className="p-4"><Skeleton className="h-20" /></div> : !traces.data?.items.length ? (
            <EmptyState icon={<ScanSearch className="h-5 w-5" />} title="No traces yet"
              description="Traces are recorded for every chat answer and inspector run once retrieval is live." />
          ) : (
            <div className="divide-y divide-border">
              {traces.data.items.map((t) => (
                <button key={t.id} onClick={() => router.push(`/inspector?trace=${t.id}`)}
                  className={cn("block w-full px-4 py-3 text-left hover:bg-surface-2", traceId === t.id && "bg-accent-soft")}>
                  <div className="line-clamp-2 text-[13px] text-text">{t.query}</div>
                  <div className="mt-1 text-[11px] text-muted">{fmtDateTime(t.created_at)} · {t.evidence_count} evidence · {fmtNum(t.total_latency_ms)} ms</div>
                </button>
              ))}
            </div>
          )}
        </Card>
        <div className="min-w-0">
          {traceId ? <TraceDetail id={traceId} /> : (
            <Card><EmptyState icon={<ListOrdered className="h-5 w-5" />} title="Select or run a trace"
              description="The inspector shows each lane's ranked candidates side by side, their RRF and reranker scores, the evidence that was finally chosen, and whether every citation resolved to an indexed record." /></Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
