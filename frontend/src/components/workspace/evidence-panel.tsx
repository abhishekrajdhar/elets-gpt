"use client";

import { BadgeCheck, ExternalLink, FileText, PlayCircle, ShieldAlert, X } from "lucide-react";
import Link from "next/link";

import { Badge, Button, EmptyState } from "@/components/ui";
import { cn, fmtDate, fmtTimestamp } from "@/lib/format";
import type { Citation, Message } from "@/lib/types";

function citationHref(c: Citation) {
  if (c.timestamp_start != null && c.url.includes("youtube.com/watch")) return `${c.url}&t=${Math.floor(c.timestamp_start)}s`;
  if (c.page_number != null && c.url.toLowerCase().includes(".pdf")) return `${c.url}#page=${c.page_number}`;
  return c.url;
}

export function EvidencePanel({ message, activeCite, onSelect, onClose }: {
  message: Message | null; activeCite: number | null; onSelect: (n: number) => void; onClose?: () => void;
}) {
  const citations = message?.citations ?? [];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <div className="text-sm font-semibold text-text">Evidence</div>
          <div className="text-[11px] text-muted">{citations.length ? `${citations.length} cited sources` : "Sources for the selected answer"}</div>
        </div>
        {onClose && <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close evidence"><X className="h-4 w-4" /></Button>}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scroll-thin">
        {!citations.length ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No evidence to show"
            description={message?.status === "error"
              ? "This answer was not generated, so there are no sources."
              : "When an answer cites sources, each excerpt, with its URL, date, page or video timestamp and verification status, appears here."} />
        ) : citations.map((c) => (
          <button key={c.index} onClick={() => onSelect(c.index)}
            className={cn("block w-full rounded-xl border bg-surface p-3.5 text-left transition-colors",
              activeCite === c.index ? "border-accent ring-3 ring-[var(--ring)]" : "border-border hover:border-border-strong")}>
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1 text-[11px] font-semibold text-accent-text">{c.index}</span>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[13px] font-medium leading-snug text-text">{c.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {c.source_name && <span>{c.source_name}</span>}
                  {c.published_at && <span>· {fmtDate(c.published_at)}</span>}
                  {c.page_number != null && <Badge>p. {c.page_number}</Badge>}
                  {c.timestamp_start != null && <Badge><PlayCircle className="h-3 w-3" />{fmtTimestamp(c.timestamp_start)}</Badge>}
                  {c.verified
                    ? <Badge tone="success"><BadgeCheck className="h-3 w-3" />Verified</Badge>
                    : <Badge tone="danger"><ShieldAlert className="h-3 w-3" />Unverified</Badge>}
                </div>
              </div>
            </div>
            <blockquote className="mt-2.5 border-l-2 border-border-strong pl-3 text-[12.5px] leading-relaxed text-text-2">{c.excerpt}</blockquote>
            <div className="mt-2.5 flex gap-3 text-[12px]">
              <a href={citationHref(c)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">Open original <ExternalLink className="h-3 w-3" /></a>
              <Link href={`/explorer/${c.document_id}`} onClick={(e) => e.stopPropagation()}
                className="text-muted hover:text-text">Indexed record</Link>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
