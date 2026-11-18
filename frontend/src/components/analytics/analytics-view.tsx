"use client";

import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Table2 } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/shell/app-shell";
import {
  Badge, Callout, Card, CardHeader, EmptyState, ErrorState, Forbidden, NotEnabled, PageHeader, Select, Skeleton, Stat, Table, Td, Th,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useCan, useFeature } from "@/lib/auth";
import { DOC_TYPE_LABELS, fmtDate, fmtNum, label, VERTICAL_LABELS } from "@/lib/format";
import type { AnalyticsOverview, EvalDataset, EvalRun } from "@/lib/types";
import { BarList, Columns } from "./charts";

const METRIC_COLS: [string, string][] = [
  ["recall@5", "Recall@5"], ["recall@10", "Recall@10"], ["hit@3", "Hit@3"], ["mrr", "MRR"], ["ndcg@10", "nDCG@10"],
  ["answer_correctness", "Correctness"], ["faithfulness", "Faithfulness"], ["citation_precision", "Cite. precision"],
  ["citation_recall", "Cite. recall"], ["unsupported_claim_rate", "Unsupported"], ["abstention_accuracy", "Abstention acc."],
  ["latency_p95_ms", "P95 ms"],
];

const STRATEGIES = ["baseline", "dense", "bm25", "hybrid", "hybrid_rrf", "hybrid_rrf_rerank", "metadata_aware", "sql"];

const ms = (v: number | null) => (v === null ? "—" : `${fmtNum(v)} ms`);

/** Continuous monthly series: months with no documents are shown as zero, so the time axis stays honest. */
function fillMonths(rows: { month: string; count: number }[]) {
  if (!rows.length) return [];
  const byKey = new Map(rows.map((r) => [r.month.slice(0, 7), r.count]));
  const [y0, m0] = rows[0].month.slice(0, 7).split("-").map(Number);
  const [y1, m1] = rows[rows.length - 1].month.slice(0, 7).split("-").map(Number);
  const out: { month: string; count: number }[] = [];
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, (m = 1)) : m++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ month: key, count: byKey.get(key) ?? 0 });
  }
  return out;
}

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

export function AnalyticsView() {
  const can = useCan();
  const evalFeature = useFeature("evaluation_runs");
  const [days, setDays] = useState(30);
  const [tableView, setTableView] = useState(false);
  const enabled = can("analytics:read");
  const q = useQuery({ queryKey: ["analytics", days], queryFn: () => api<AnalyticsOverview>("/analytics/overview", { query: { days } }), enabled });
  const runs = useQuery({ queryKey: ["eval-runs"], queryFn: () => api<EvalRun[]>("/eval/runs"), enabled });
  const datasets = useQuery({ queryKey: ["eval-datasets"], queryFn: () => api<EvalDataset[]>("/eval/datasets"), enabled });

  if (!enabled) return <PageContainer><Card><Forbidden permission="analytics:read" /></Card></PageContainer>;

  const u = q.data?.usage;
  const c = q.data?.corpus;
  const noUsage = u && u.events === 0;

  return (
    <PageContainer>
      <PageHeader title="Analytics & Evaluation"
        description="Corpus coverage, usage, latency, cost and retrieval quality. Every number is computed from recorded data, and an empty period stays empty."
        actions={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-36">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option><option value={365}>Last 12 months</option>
          </Select>
        } />

      {q.error ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-text">Corpus</h2>
          {!c ? <Skeleton className="mb-8 h-24" /> : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Indexed documents" value={fmtNum(c.documents)} hint={c.sample_documents ? <Badge tone="sample">{c.sample_documents} sample</Badge> : "Active documents"} />
                <Stat label="Active chunks" value={fmtNum(c.chunks)} hint="Retrievable passages" />
                <Stat label="Registered sources" value={fmtNum(c.sources)} />
                <Stat label="Content types" value={fmtNum(c.by_doc_type.length)} hint="Distinct document types" />
              </div>
              {c.sample_documents > 0 && <Callout tone="sample" className="mb-4">Corpus figures include {c.sample_documents} fictional sample documents loaded for UI review.</Callout>}
              <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <Card>
                  <CardHeader title="Documents by vertical" />
                  <div className="p-4"><BarList data={c.by_vertical.map((b) => ({ label: label(VERTICAL_LABELS, b.value), value: b.count }))} emptyLabel="No documents indexed yet." /></div>
                </Card>
                <Card>
                  <CardHeader title="Publication volume by month" description="Last 24 months, by publication date"
                    actions={<button onClick={() => setTableView((t) => !t)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-text"><Table2 className="h-3.5 w-3.5" />{tableView ? "Chart" : "Table"}</button>} />
                  <div className="p-4">
                    {tableView ? (
                      <Table><thead><tr><Th>Month</Th><Th className="text-right">Documents</Th></tr></thead>
                        <tbody>{fillMonths(c.by_month).map((m) => <tr key={m.month}><Td>{m.month}</Td><Td className="text-right tabular-nums">{m.count}</Td></tr>)}</tbody></Table>
                    ) : <Columns data={fillMonths(c.by_month).map((m) => ({ label: monthLabel(m.month), value: m.count }))} />}
                  </div>
                </Card>
              </div>
            </>
          )}

          <h2 className="mb-3 text-sm font-semibold text-text">Usage &amp; performance <span className="font-normal text-muted">· last {days} days</span></h2>
          {!u ? <Skeleton className="mb-8 h-24" /> : (
            <>
              {noUsage && <Callout className="mb-4" title="No queries recorded in this period">
                Usage, latency, token and cost figures are recorded per request once the answer engine is live (Phases 3–4). They show &quot;—&quot; until real data exists.
              </Callout>}
              <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Requests" value={fmtNum(u.events)} hint={`${fmtNum(u.chat_requests)} chat`} />
                <Stat label="Failed requests" value={fmtNum(u.failed)} hint={u.events ? `${((u.failed / u.events) * 100).toFixed(1)}% of requests` : "—"} />
                <Stat label="Answer latency" value={ms(u.answer_latency_ms.p50)} hint={`P95 ${ms(u.answer_latency_ms.p95)}`} tone={u.answer_latency_ms.p50 === null ? "muted" : "default"} />
                <Stat label="Retrieval latency" value={ms(u.retrieval_latency_ms.p50)} hint={`P95 ${ms(u.retrieval_latency_ms.p95)}`} tone={u.retrieval_latency_ms.p50 === null ? "muted" : "default"} />
                <Stat label="Tokens" value={fmtNum(u.prompt_tokens + u.completion_tokens)} hint={`${fmtNum(u.prompt_tokens)} in · ${fmtNum(u.completion_tokens)} out · ${fmtNum(u.embedding_tokens)} embed`} />
                <Stat label="Estimated cost" value={u.events ? `$${u.cost_usd.toFixed(2)}` : "—"} hint="From admin-configured model prices" tone={u.events ? "default" : "muted"} />
                <Stat label="Abstentions" value={fmtNum(u.abstained)} hint="Insufficient-evidence replies" />
                <Stat label="Feedback" value={`${u.feedback.positive} 👍 · ${u.feedback.negative} 👎`} hint="User ratings on answers" />
              </div>
            </>
          )}
        </>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Retrieval &amp; answer evaluation</h2>
        {evalFeature && !evalFeature.enabled && <NotEnabled compact feature={evalFeature.label} phase={evalFeature.phase} />}
      </div>
      <Card className="mb-4">
        <CardHeader title="Strategy comparison" description="Each completed benchmark run appears as a row. Metrics are computed against human-verified ground truth." />
        {runs.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : !runs.data?.length ? (
          <div>
            <EmptyState icon={<FlaskConical className="h-5 w-5" />} title="No evaluation runs yet"
              description="Benchmark runs start once there is a human-reviewed question set (150+ questions verified against real Elets sources) and the retrieval engine is live. No metrics are estimated until then." />
            <div className="border-t border-border px-5 py-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Configurations that will be compared</div>
              <div className="flex flex-wrap gap-1.5">{STRATEGIES.map((s) => <Badge key={s}>{s.replace(/_/g, " ")}</Badge>)}</div>
            </div>
          </div>
        ) : (
          <Table>
            <thead><tr><Th>Run</Th><Th>Strategy</Th><Th>Status</Th>{METRIC_COLS.map(([, l]) => <Th key={l} className="text-right">{l}</Th>)}</tr></thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <Td className="text-text">{r.name}<div className="text-[11px] text-muted">{fmtDate(r.created_at)}</div></Td>
                  <Td><Badge>{r.strategy}</Badge></Td>
                  <Td><Badge tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "info"}>{r.status}</Badge></Td>
                  {METRIC_COLS.map(([k]) => <Td key={k} className="text-right font-mono tabular-nums">{r.metrics?.[k] != null ? Number(r.metrics[k]).toFixed(3) : "—"}</Td>)}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Benchmark datasets" description="Question sets with category coverage and review status" />
        {datasets.isLoading ? <div className="p-5"><Skeleton className="h-16" /></div> : !datasets.data?.length ? (
          <div className="px-5 py-6 text-[13px] text-muted">No datasets yet. Benchmark creation and human review arrive in Phase 6, after the corpus is populated.</div>
        ) : (
          <Table>
            <thead><tr><Th>Dataset</Th><Th>Version</Th><Th className="text-right">Questions</Th><Th className="text-right">Verified</Th></tr></thead>
            <tbody>{datasets.data.map((d) => {
              const total = d.questions.reduce((a, x) => a + x.count, 0);
              const verified = d.questions.filter((x) => x.review_status === "verified").reduce((a, x) => a + x.count, 0);
              return <tr key={d.id}><Td className="text-text">{d.name}</Td><Td>v{d.version}</Td><Td className="text-right tabular-nums">{total}</Td><Td className="text-right tabular-nums">{verified}</Td></tr>;
            })}</tbody>
          </Table>
        )}
      </Card>
      {c && c.by_doc_type.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Documents by content type" />
          <div className="p-4"><BarList data={c.by_doc_type.map((b) => ({ label: label(DOC_TYPE_LABELS, b.value), value: b.count }))} /></div>
        </Card>
      )}
    </PageContainer>
  );
}
