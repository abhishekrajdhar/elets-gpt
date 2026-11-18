"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, CircleDashed, ExternalLink, KeyRound, Minus, Plus, Search, UserCog } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";

import { PageContainer } from "@/components/shell/app-shell";
import {
  Badge, Button, Callout, Card, CardHeader, Dialog, EmptyState, ErrorState, Field, Forbidden, Input, PageHeader, Pagination, Select, Skeleton,
  Table, Tabs, Td, Th, useToast,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useCan, useMe } from "@/lib/auth";
import { fmtDateTime, relTime, ROLE_LABELS } from "@/lib/format";
import type { AuditRow, Page, ProviderStatus, Role, UserRow } from "@/lib/types";
import { SettingsForm, type FieldSpec } from "./settings-form";

type Tab = "users" | "roles" | "models" | "embeddings" | "retrieval" | "limits" | "api" | "audit";

/* ------------------------------------------------------------- Users */

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ email: "", full_name: "", role: "viewer", password: "" });
  const m = useMutation({
    mutationFn: () => api("/users", { method: "POST", body: f }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast({ tone: "success", title: "User created", body: `Share the temporary password with ${f.email} through a secure channel.` }); setF({ email: "", full_name: "", role: "viewer", password: "" }); onClose(); },
  });
  return (
    <Dialog open={open} onClose={onClose} title="Invite user" description="Accounts are provisioned by administrators. The user should change the temporary password after signing in."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Create user</Button></>}>
      <div className="space-y-4">
        <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Temporary password" hint="At least 12 characters, mixing three of: lowercase, uppercase, digits, symbols.">
          <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {m.error && <Callout tone="danger">{errorMessage(m.error)}</Callout>}
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/users/${user!.id}/reset-password`, { method: "POST", body: { password: pw } }),
    onSuccess: () => { toast({ tone: "success", title: "Password reset", body: "All of the user's sessions were signed out." }); setPw(""); onClose(); },
  });
  return (
    <Dialog open={!!user} onClose={onClose} title={`Reset password for ${user?.full_name ?? ""}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Reset password</Button></>}>
      <Field label="New temporary password" error={m.error ? errorMessage(m.error) : null}>
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
    </Dialog>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const users = useQuery({ queryKey: ["users", q, offset], placeholderData: keepPreviousData,
    queryFn: () => api<Page<UserRow>>("/users", { query: { q, offset, limit: 50 } }) });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/users/${id}`, { method: "PATCH", body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["roles"] }); toast({ tone: "success", title: "User updated", body: "Changed privileges take effect at the user's next sign-in." }); },
    onError: (e) => toast({ tone: "danger", title: "Update refused", body: errorMessage(e) }),
  });
  return (
    <Card>
      <CardHeader title="Users" description="Role changes and deactivations sign the user out of every session immediately."
        actions={<>
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search" className="h-8 w-48 pl-8 text-[13px]" /></div>
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Invite user</Button>
        </>} />
      {users.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : users.error ? <ErrorState error={users.error} /> : (
        <>
          <Table>
            <thead><tr><Th>User</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th>Created</Th><Th /></tr></thead>
            <tbody>{users.data!.items.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <Td><div className="font-medium text-text">{u.full_name}{self && <span className="ml-1.5 text-[11px] font-normal text-muted">(you)</span>}</div><div className="text-[12px] text-muted">{u.email}</div></Td>
                  <Td><Select value={u.role} disabled={self || update.isPending} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })} className="h-8 w-48 text-[13px]">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Td>
                  <Td>{u.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</Td>
                  <Td className="text-[12.5px]">{relTime(u.last_login_at)}</Td>
                  <Td className="text-[12.5px]">{fmtDateTime(u.created_at)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => setResetUser(u)}><KeyRound className="h-3.5 w-3.5" />Reset password</Button>
                    {!self && <Button variant="ghost" size="sm" className={u.is_active ? "text-danger" : ""}
                      onClick={() => update.mutate({ id: u.id, body: { is_active: !u.is_active } })}>{u.is_active ? "Deactivate" : "Reactivate"}</Button>}
                  </Td>
                </tr>
              );
            })}</tbody>
          </Table>
          <Pagination total={users.data!.total} limit={50} offset={offset} onChange={setOffset} />
        </>
      )}
      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} />
    </Card>
  );
}

/* ------------------------------------------------------------- Roles */

function RolesTab() {
  const q = useQuery({ queryKey: ["roles"], queryFn: () => api<{ permissions: string[]; roles: { role: string; description: string; permissions: string[]; max_access_level: string; user_count: number }[] }>("/roles") });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <Card><ErrorState error={q.error} /></Card>;
  const { roles, permissions } = q.data!;
  return (
    <Card>
      <CardHeader title="Role permissions" description="Defined in code (backend/app/core/rbac.py), so every change is reviewed in git. Document access levels are enforced on every query." />
      <Table>
        <thead><tr><Th>Permission</Th>{roles.map((r) => <Th key={r.role} className="text-center">{ROLE_LABELS[r.role]}<div className="font-normal">{r.user_count} user{r.user_count === 1 ? "" : "s"}</div></Th>)}</tr></thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p}><Td className="font-mono text-[12.5px] text-text">{p}</Td>
              {roles.map((r) => <Td key={r.role} className="text-center">{r.permissions.includes(p) ? <Check className="mx-auto h-4 w-4 text-success" /> : <Minus className="mx-auto h-4 w-4 text-border-strong" />}</Td>)}
            </tr>
          ))}
          <tr className="bg-surface-2/50"><Td className="font-medium text-text">Max document access</Td>{roles.map((r) => <Td key={r.role} className="text-center"><Badge tone={r.max_access_level === "public" ? "neutral" : "warning"}>{r.max_access_level}</Badge></Td>)}</tr>
        </tbody>
      </Table>
      <div className="grid gap-3 border-t border-border p-5 sm:grid-cols-2 lg:grid-cols-4">
        {roles.map((r) => <div key={r.role}><div className="text-[13px] font-medium text-text">{ROLE_LABELS[r.role]}</div><div className="text-[12.5px] text-muted">{r.description}</div></div>)}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- Settings tabs */

type SettingsResp = { values: Record<string, Record<string, string | number | boolean | null>>; meta: Record<string, { updated_at: string }> };

const LLM_FIELDS: FieldSpec[] = [
  { key: "provider", label: "Provider", type: "select", options: [["anthropic", "Anthropic"], ["openai", "OpenAI"], ["openai_compatible", "OpenAI-compatible (vLLM, Azure, Ollama…)"], ["google", "Google"]] },
  { key: "model", label: "Answer model", type: "text", hint: "Model ID used for grounded answer generation" },
  { key: "classifier_model", label: "Classifier model", type: "text", hint: "Small, fast model for query classification" },
  { key: "temperature", label: "Temperature", type: "number", step: 0.05, min: 0, max: 1 },
  { key: "max_output_tokens", label: "Max output tokens", type: "number", min: 64, max: 16000 },
  { key: "request_timeout_seconds", label: "Request timeout (s)", type: "number", min: 5, max: 600 },
  { key: "input_price_per_mtok_usd", label: "Input price (USD / 1M tokens)", type: "number", step: 0.01, nullable: true, hint: "From the provider's current price list. Cost stays unset until both prices are entered." },
  { key: "output_price_per_mtok_usd", label: "Output price (USD / 1M tokens)", type: "number", step: 0.01, nullable: true },
];
const EMB_FIELDS: FieldSpec[] = [
  { key: "provider", label: "Provider", type: "select", options: [["local", "Local (sentence-transformers)"], ["openai_compatible", "OpenAI-compatible"], ["voyage", "Voyage AI"], ["cohere", "Cohere"]] },
  { key: "model", label: "Model", type: "text" },
  { key: "dimension", label: "Dimension", type: "number", min: 32, max: 4096, hint: "Changing the model creates a parallel index. Existing vectors are kept until the switch-over." },
  { key: "batch_size", label: "Batch size", type: "number", min: 1, max: 512 },
  { key: "normalize", label: "L2-normalise vectors", type: "bool" },
];
const RERANK_FIELDS: FieldSpec[] = [
  { key: "enabled", label: "Reranking enabled", type: "bool" },
  { key: "provider", label: "Provider", type: "select", options: [["local", "Local cross-encoder"], ["cohere", "Cohere Rerank"], ["voyage", "Voyage Rerank"], ["jina", "Jina Reranker"]] },
  { key: "model", label: "Model", type: "text" },
  { key: "top_n", label: "Candidates to rerank", type: "number", min: 1, max: 200 },
];
const RETRIEVAL_FIELDS: FieldSpec[] = [
  { key: "dense_top_k", label: "Dense candidates (top-k)", type: "number", min: 1, max: 500 },
  { key: "lexical_top_k", label: "BM25 candidates (top-k)", type: "number", min: 1, max: 500 },
  { key: "rrf_k", label: "RRF constant k", type: "number", min: 1, max: 1000, hint: "score = Σ w / (k + rank)" },
  { key: "rrf_weight_dense", label: "RRF weight: dense", type: "number", step: 0.1, min: 0, max: 10 },
  { key: "rrf_weight_lexical", label: "RRF weight: lexical", type: "number", step: 0.1, min: 0, max: 10 },
  { key: "final_context_k", label: "Final evidence passages", type: "number", min: 1, max: 50 },
  { key: "max_context_tokens", label: "Max context tokens", type: "number", min: 500, max: 100000 },
  { key: "per_document_cap", label: "Max passages per document", type: "number", min: 1, max: 20 },
  { key: "abstain_threshold", label: "Abstention threshold", type: "number", step: 0.05, min: 0, max: 1, hint: "Below this evidence score the assistant abstains" },
  { key: "classifier_mode", label: "Query classifier", type: "select", options: [["rules", "Rules only"], ["rules+llm", "Rules, LLM when uncertain"]] },
];
const LIMIT_FIELDS: FieldSpec[] = [
  { key: "chat_requests_per_minute", label: "Chat requests / user / minute", type: "number", min: 1, max: 1000 },
  { key: "chat_requests_per_day", label: "Chat requests / user / day", type: "number", min: 1, max: 100000 },
  { key: "max_question_chars", label: "Max question length (chars)", type: "number", min: 100, max: 20000 },
  { key: "monthly_budget_usd", label: "Monthly LLM budget (USD)", type: "number", step: 1, nullable: true, hint: "Optional; used for spend alerts" },
];

function ProviderTable() {
  const q = useQuery({ queryKey: ["providers"], queryFn: () => api<ProviderStatus[]>("/settings/providers/status") });
  return (
    <Card>
      <CardHeader title="Provider credentials" description="Secrets are read from server environment variables only. This page shows whether each is set, never its value." />
      {q.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : q.error ? <ErrorState error={q.error} /> : (
        <Table>
          <thead><tr><Th>Provider</Th><Th>Environment variables</Th><Th>Status</Th></tr></thead>
          <tbody>{q.data!.map((p) => (
            <tr key={p.provider}><Td className="font-medium text-text">{p.provider}</Td>
              <Td className="font-mono text-[12px]">{p.env_vars.length ? p.env_vars.join(", ") : <span className="font-sans text-muted">none required</span>}</Td>
              <Td>{!p.requires_credentials ? <Badge>Not required</Badge> : p.configured ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" />Configured</Badge> : <Badge tone="warning"><CircleDashed className="h-3 w-3" />Missing {p.missing.join(", ")}</Badge>}</Td>
            </tr>))}</tbody>
        </Table>
      )}
    </Card>
  );
}

function SettingsTabs({ tab }: { tab: Tab }) {
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsResp>("/settings") });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <Card><ErrorState error={q.error} /></Card>;
  const { values, meta } = q.data!;
  if (tab === "models") return (
    <div className="space-y-4">
      <SettingsForm key={JSON.stringify(values.llm)} settingKey="llm" title="Language model" description="Provider-independent adapter. Answers are generated only from retrieved evidence." fields={LLM_FIELDS} values={values.llm} updatedAt={meta.llm?.updated_at} />
      <ProviderTable />
    </div>
  );
  if (tab === "embeddings") return (
    <div className="space-y-4">
      <SettingsForm key={JSON.stringify(values.embedding)} settingKey="embedding" title="Embeddings" description="Used for dense retrieval. Each model gets its own vector index." fields={EMB_FIELDS} values={values.embedding} updatedAt={meta.embedding?.updated_at} />
      <SettingsForm key={JSON.stringify(values.reranker)} settingKey="reranker" title="Reranker" description="Cross-encoder scoring of fused candidates" fields={RERANK_FIELDS} values={values.reranker} updatedAt={meta.reranker?.updated_at} />
    </div>
  );
  if (tab === "retrieval") return <SettingsForm key={JSON.stringify(values.retrieval)} settingKey="retrieval" title="Retrieval pipeline" description="Candidate counts, fusion and evidence selection. Every trace records the configuration it used." fields={RETRIEVAL_FIELDS} values={values.retrieval} updatedAt={meta.retrieval?.updated_at} />;
  return <SettingsForm key={JSON.stringify(values.usage_limits)} settingKey="usage_limits" title="Usage limits" description="Per-user rate limits (enforced in Redis) and input limits" fields={LIMIT_FIELDS} values={values.usage_limits} updatedAt={meta.usage_limits?.updated_at} />;
}

/* ------------------------------------------------------------- API */

function ApiTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="REST API" description="OpenAPI 3.1. Interactive documentation is served by the backend." />
        <div className="space-y-3 p-5 text-[13px] text-text-2">
          <div className="flex flex-wrap gap-2">
            <a href="/api/docs" target="_blank" rel="noopener noreferrer"><Button size="sm"><ExternalLink className="h-3.5 w-3.5" />Swagger UI</Button></a>
            <a href="/api/redoc" target="_blank" rel="noopener noreferrer"><Button size="sm"><ExternalLink className="h-3.5 w-3.5" />ReDoc</Button></a>
            <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer"><Button size="sm"><ExternalLink className="h-3.5 w-3.5" />openapi.json</Button></a>
          </div>
          <p>Base path: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">/api/v1</code>. Browser sessions use an HttpOnly cookie and must send <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">X-Requested-With: eletsgpt</code> on state-changing requests. Service clients can send <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">Authorization: Bearer &lt;token&gt;</code>.</p>
          <p>Errors always use the envelope <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{`{"error": {"code", "message", "details", "request_id"}}`}</code>. Features that haven&apos;t shipped return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">503 engine_not_ready</code>.</p>
        </div>
      </Card>
      <ProviderTable />
    </div>
  );
}

/* ------------------------------------------------------------- Audit */

function AuditTab() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["audit", action, actor, offset], placeholderData: keepPreviousData,
    queryFn: () => api<Page<AuditRow> & { actions: string[] }>("/audit-logs", { query: { action, actor, offset, limit: 50 } }) });
  return (
    <Card>
      <CardHeader title="Audit log" description="Append-only record of sign-ins, user, source, document and settings changes"
        actions={<>
          <Select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} className="h-8 w-48 text-[13px]">
            <option value="">All actions</option>{q.data?.actions.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
          <Input value={actor} onChange={(e) => { setActor(e.target.value); setOffset(0); }} placeholder="Actor email" className="h-8 w-44 text-[13px]" />
        </>} />
      {q.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : q.error ? <ErrorState error={q.error} /> : !q.data!.items.length ? (
        <EmptyState icon={<UserCog className="h-5 w-5" />} title="No audit entries match" />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Resource</Th><Th>IP</Th><Th /></tr></thead>
            <tbody>{q.data!.items.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <Td className="whitespace-nowrap text-[12.5px]">{fmtDateTime(r.created_at)}</Td>
                  <Td className="text-[12.5px]">{r.actor_email ?? "—"}</Td>
                  <Td><Badge tone={r.action.includes("failed") ? "danger" : r.action.startsWith("auth") ? "neutral" : "accent"}>{r.action}</Badge></Td>
                  <Td className="font-mono text-[11.5px]">{r.resource_type}{r.resource_id && <span className="text-muted"> · {r.resource_id.slice(0, 8)}</span>}</Td>
                  <Td className="font-mono text-[11.5px]">{r.ip ?? "—"}</Td>
                  <Td className="text-right">{Object.keys(r.details).length > 0 && <button className="text-[12px] text-accent-text hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Details"}</button>}</Td>
                </tr>
                {open === r.id && <tr><Td colSpan={6} className="bg-surface-2/50"><pre className="overflow-x-auto font-mono text-[11.5px] text-text-2">{JSON.stringify(r.details, null, 2)}</pre></Td></tr>}
              </Fragment>
            ))}</tbody>
          </Table>
          <Pagination total={q.data!.total} limit={50} offset={offset} onChange={setOffset} />
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------- View */

export function AdminView() {
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const canUsers = can("users:manage"), canSettings = can("settings:manage"), canAudit = can("audit:read");
  const defaultTab: Tab = canUsers ? "users" : canSettings ? "models" : "audit";
  const tab = (sp.get("tab") as Tab) ?? defaultTab;
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  if (!canUsers && !canSettings && !canAudit) return <PageContainer><Card><Forbidden permission="users:manage" /></Card></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title="Administration" description="Users and roles, model and retrieval configuration, usage limits, API access and the audit trail." />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "users", label: "Users", hidden: !canUsers },
        { value: "roles", label: "Roles & permissions", hidden: !canUsers },
        { value: "models", label: "Models & providers", hidden: !canSettings },
        { value: "embeddings", label: "Embeddings & reranker", hidden: !canSettings },
        { value: "retrieval", label: "Retrieval", hidden: !canSettings },
        { value: "limits", label: "Usage limits", hidden: !canSettings },
        { value: "api", label: "API", hidden: !canSettings },
        { value: "audit", label: "Audit log", hidden: !canAudit },
      ]} />
      {tab === "users" && canUsers && <UsersTab />}
      {tab === "roles" && canUsers && <RolesTab />}
      {["models", "embeddings", "retrieval", "limits"].includes(tab) && canSettings && <SettingsTabs tab={tab} />}
      {tab === "api" && canSettings && <ApiTab />}
      {tab === "audit" && canAudit && <AuditTab />}
    </PageContainer>
  );
}
