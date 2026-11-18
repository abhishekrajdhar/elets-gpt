"use client";

import { CalendarRange, Check, Layers, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui";
import { cn, VERTICAL_LABELS } from "@/lib/format";
import type { ChatFilters, Vertical } from "@/lib/types";

const VERTICALS = Object.keys(VERTICAL_LABELS) as Vertical[];

function Popover({ trigger, children }: { trigger: (open: boolean) => React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && <div className="absolute bottom-full left-0 z-30 mb-2 min-w-[240px] rounded-xl border border-border bg-surface p-2 shadow-pop">{children}</div>}
    </div>
  );
}

const chip = "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors cursor-pointer";

export function FiltersBar({ value, onChange }: { value: ChatFilters; onChange: (f: ChatFilters) => void }) {
  const toggle = (v: Vertical) =>
    onChange({ ...value, verticals: value.verticals.includes(v) ? value.verticals.filter((x) => x !== v) : [...value.verticals, v] });
  const hasDate = value.date_from || value.date_to;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover trigger={(open) => (
        <span className={cn(chip, value.verticals.length || open ? "border-accent/40 bg-accent-soft text-accent-text" : "border-border text-text-2 hover:bg-surface-2")}>
          <Layers className="h-3.5 w-3.5" />
          {value.verticals.length ? value.verticals.map((v) => VERTICAL_LABELS[v]).join(", ") : "All verticals"}
        </span>
      )}>
        <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">Elets verticals</div>
        {VERTICALS.map((v) => (
          <button key={v} onClick={() => toggle(v)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-text-2 hover:bg-surface-2">
            {VERTICAL_LABELS[v]}
            {value.verticals.includes(v) && <Check className="h-3.5 w-3.5 text-accent" />}
          </button>
        ))}
        {value.verticals.length > 0 && (
          <button onClick={() => onChange({ ...value, verticals: [] })} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-muted hover:bg-surface-2">Clear selection</button>
        )}
      </Popover>

      <Popover trigger={(open) => (
        <span className={cn(chip, hasDate || open ? "border-accent/40 bg-accent-soft text-accent-text" : "border-border text-text-2 hover:bg-surface-2")}>
          <CalendarRange className="h-3.5 w-3.5" />
          {hasDate ? `${value.date_from ?? "…"} → ${value.date_to ?? "…"}` : "Any date"}
        </span>
      )}>
        <div className="space-y-2 p-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Publication date</div>
          <label className="block text-[12px] text-muted">From
            <Input type="date" value={value.date_from ?? ""} max={value.date_to ?? undefined}
              onChange={(e) => onChange({ ...value, date_from: e.target.value || null })} className="mt-1 h-8" />
          </label>
          <label className="block text-[12px] text-muted">To
            <Input type="date" value={value.date_to ?? ""} min={value.date_from ?? undefined}
              onChange={(e) => onChange({ ...value, date_to: e.target.value || null })} className="mt-1 h-8" />
          </label>
        </div>
      </Popover>

      {(value.verticals.length > 0 || hasDate) && (
        <button onClick={() => onChange({ verticals: [], date_from: null, date_to: null, doc_types: [] })}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-muted hover:text-text">
          <X className="h-3 w-3" /> Reset
        </button>
      )}
    </div>
  );
}
