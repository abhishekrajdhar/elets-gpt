"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Callout, Card, CardHeader, Field, Input, Select, Switch, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export type FieldSpec = {
  key: string; label: string; type: "number" | "text" | "select" | "bool"; options?: [string, string][];
  hint?: string; step?: number; min?: number; max?: number; nullable?: boolean;
};

type Values = Record<string, string | number | boolean | null>;

export function SettingsForm({ settingKey, title, description, fields, values, updatedAt }: {
  settingKey: string; title: string; description: string; fields: FieldSpec[]; values: Values; updatedAt?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  // Parent remounts this form (key) when saved values change, so local edits start from fresh data.
  const [form, setForm] = useState<Values>(values);
  const dirty = JSON.stringify(form) !== JSON.stringify(values);

  const save = useMutation({
    mutationFn: () => {
      const body: Values = { ...values };
      for (const f of fields) {
        const v = form[f.key];
        if (f.type === "number") body[f.key] = v === "" || v === null ? (f.nullable ? null : v) : Number(v);
        else body[f.key] = v;
      }
      return api(`/settings/${settingKey}`, { method: "PUT", body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["pipeline"] }); toast({ tone: "success", title: `${title} saved`, body: "The change is recorded in the audit log." }); },
  });

  return (
    <Card>
      <CardHeader title={title} description={description}
        actions={updatedAt && <span className="text-[11.5px] text-muted">Updated {fmtDateTime(updatedAt)}</span>} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {f.type === "select" ? (
              <Select value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            ) : f.type === "bool" ? (
              <div className="flex h-9 items-center"><Switch checked={!!form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} label={f.label} /></div>
            ) : (
              <Input type={f.type} step={f.step} min={f.min} max={f.max} value={form[f.key] === null ? "" : String(form[f.key] ?? "")}
                placeholder={f.nullable ? "Not set" : undefined}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className={f.type === "text" ? "font-mono text-[13px]" : "tabular-nums"} />
            )}
          </Field>
        ))}
      </div>
      {save.error && <div className="px-5 pb-4"><Callout tone="danger">{errorMessage(save.error)}</Callout></div>}
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button size="sm" disabled={!dirty} onClick={() => setForm(values)}>Reset</Button>
        <Button size="sm" variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>
      </div>
    </Card>
  );
}
