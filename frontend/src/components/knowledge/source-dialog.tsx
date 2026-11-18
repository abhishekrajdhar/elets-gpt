"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Callout, Dialog, Field, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { SOURCE_TYPE_LABELS, VERTICAL_LABELS } from "@/lib/format";
import type { Source } from "@/lib/types";

type Form = {
  name: string; slug: string; source_type: string; base_url: string; vertical: string; access_level: string; enabled: boolean;
  description: string; schedule_cron: string; max_pages: string; rate_limit_rps: string; allowed_paths: string; blocked_paths: string;
};

const blank: Form = {
  name: "", slug: "", source_type: "website", base_url: "https://", vertical: "general", access_level: "public", enabled: true,
  description: "", schedule_cron: "0 2 * * *", max_pages: "5000", rate_limit_rps: "0.5", allowed_paths: "", blocked_paths: "/wp-admin\n/wp-login.php",
};

function fromSource(s: Source): Form {
  return {
    name: s.name, slug: s.slug, source_type: s.source_type, base_url: s.base_url, vertical: s.vertical, access_level: s.access_level,
    enabled: s.enabled, description: s.description ?? "", schedule_cron: s.schedule_cron ?? "",
    max_pages: String(s.crawl_config.max_pages ?? 5000), rate_limit_rps: String(s.crawl_config.rate_limit_rps ?? 0.5),
    allowed_paths: (s.crawl_config.allowed_paths ?? []).join("\n"), blocked_paths: (s.crawl_config.blocked_paths ?? []).join("\n"),
  };
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function SourceDialog({ open, onClose, source }: { open: boolean; onClose: () => void; source: Source | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => (source ? fromSource(source) : blank));
  const set = (k: keyof Form) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const crawl_config = {
        ...(source?.crawl_config ?? { discovery: ["robots", "sitemap", "rss", "wp_api"] }),
        max_pages: Number(f.max_pages), rate_limit_rps: Number(f.rate_limit_rps), respect_robots: true,
        allowed_paths: lines(f.allowed_paths), blocked_paths: lines(f.blocked_paths),
      };
      const body = {
        name: f.name, base_url: f.base_url, vertical: f.vertical, access_level: f.access_level, enabled: f.enabled,
        description: f.description || null, schedule_cron: f.schedule_cron || null, crawl_config,
      };
      return source
        ? api<Source>(`/sources/${source.id}`, { method: "PATCH", body })
        : api<Source>("/sources", { method: "POST", body: { ...body, slug: f.slug, source_type: f.source_type } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      toast({ tone: "success", title: source ? "Source updated" : "Source added" });
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api(`/sources/${source!.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sources"] }); toast({ tone: "success", title: "Source deleted" }); onClose(); },
    onError: (e) => toast({ tone: "danger", title: "Can't delete source", body: errorMessage(e) }),
  });

  return (
    <Dialog open={open} onClose={onClose} wide title={source ? `Edit ${source.name}` : "Add source"}
      description="Crawling always obeys robots.txt and per-host rate limits. Authentication and paywalls are never bypassed."
      footer={
        <>
          {source && <Button variant="ghost" className="mr-auto text-danger" loading={del.isPending}
            onClick={() => confirm(`Delete source "${source.name}"? Sources with indexed documents can only be disabled.`) && del.mutate()}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{source ? "Save changes" : "Add source"}</Button>
        </>
      }>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name")(e.target.value)} /></Field>
        <Field label="Slug" hint="Lowercase identifier; cannot be changed later">
          <Input value={f.slug} disabled={!!source} onChange={(e) => set("slug")(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
        </Field>
        <Field label="Source type">
          <Select value={f.source_type} disabled={!!source} onChange={(e) => set("source_type")(e.target.value)}>
            {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Vertical">
          <Select value={f.vertical} onChange={(e) => set("vertical")(e.target.value)}>
            {Object.entries(VERTICAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Base URL" className="sm:col-span-2"><Input value={f.base_url} onChange={(e) => set("base_url")(e.target.value)} /></Field>
        <Field label="Default access level" hint="Applied to documents from this source">
          <Select value={f.access_level} onChange={(e) => set("access_level")(e.target.value)}>
            <option value="public">Public: all roles</option><option value="internal">Internal: analysts and above</option>
            <option value="restricted">Restricted: managers and admins</option>
          </Select>
        </Field>
        <Field label="Schedule (cron, UTC)" hint="e.g. 0 2 * * * = daily at 02:00. Leave empty for manual only.">
          <Input value={f.schedule_cron} onChange={(e) => set("schedule_cron")(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Max pages per run"><Input type="number" min={1} value={f.max_pages} onChange={(e) => set("max_pages")(e.target.value)} /></Field>
        <Field label="Rate limit (requests / second)" hint="Max 5; default 0.5 for politeness">
          <Input type="number" step="0.1" min={0.1} max={5} value={f.rate_limit_rps} onChange={(e) => set("rate_limit_rps")(e.target.value)} />
        </Field>
        <Field label="Allowed path prefixes" hint="One per line; empty = whole site"><Textarea rows={3} value={f.allowed_paths} onChange={(e) => set("allowed_paths")(e.target.value)} className="font-mono text-[12.5px]" /></Field>
        <Field label="Blocked path prefixes" hint="One per line"><Textarea rows={3} value={f.blocked_paths} onChange={(e) => set("blocked_paths")(e.target.value)} className="font-mono text-[12.5px]" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={f.description} onChange={(e) => set("description")(e.target.value)} /></Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={f.enabled} onChange={set("enabled")} label="Enabled" />
          <span className="text-[13px] text-text-2">Enabled for scheduled ingestion</span>
          <span className="ml-auto rounded-md bg-success-soft px-2 py-1 text-[11.5px] font-medium text-success">robots.txt: always respected</span>
        </div>
      </div>
      {save.error && <Callout tone="danger" className="mt-4">{errorMessage(save.error)}</Callout>}
    </Dialog>
  );
}
