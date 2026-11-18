"use client";

import { useState } from "react";

import { cn } from "@/lib/format";

/** Single-series horizontal bars (magnitude). One hue; labels and values in text tokens; hover tooltip via title + highlight. */
export function BarList({ data, emptyLabel = "No data" }: { data: { label: string; value: number }[]; emptyLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div className="py-6 text-center text-[13px] text-muted">{emptyLabel}</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ul className="space-y-1" role="list">
      {data.map((d, i) => (
        <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          className={cn("grid grid-cols-[minmax(96px,140px)_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1", hover === i && "bg-surface-2")}
          title={`${d.label}: ${d.value.toLocaleString()} (${((d.value / total) * 100).toFixed(1)}%)`}>
          <span className="truncate text-[12.5px] text-text-2">{d.label}</span>
          <span className="relative h-3">
            <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent transition-opacity"
              style={{ width: `${Math.max((d.value / max) * 100, 1.5)}%`, opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </span>
          <span className="w-12 text-right text-[12.5px] tabular-nums text-text">{d.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

/** Single-series column chart over time with hover tooltip. */
export function Columns({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div className="py-6 text-center text-[13px] text-muted">No dated documents in the last 24 months.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const ticks = [max, Math.round(max / 2), 0];
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-right text-[10.5px] tabular-nums text-muted" style={{ height }}>
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between" style={{ height }} aria-hidden>
            {ticks.map((_, i) => <div key={i} className={cn("border-t", i === ticks.length - 1 ? "border-border-strong" : "border-dashed border-border")} />)}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height }}>
            {data.map((d, i) => (
              <div key={d.label} className="group relative flex h-full flex-1 items-end"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="w-full rounded-t-[4px] bg-accent transition-opacity"
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, opacity: hover === null || hover === i ? 1 : 0.45 }} />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] shadow-pop">
                    <div className="text-muted">{d.label}</div>
                    <div className="font-semibold tabular-nums text-text">{d.value.toLocaleString()} documents</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-muted">
            <span>{data[0].label}</span>
            {data.length > 2 && <span>{data[Math.floor(data.length / 2)].label}</span>}
            <span>{data[data.length - 1].label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
