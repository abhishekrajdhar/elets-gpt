"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown subset → React nodes (no innerHTML). Supports paragraphs, "-"/"*"/"1." lists,
 * **bold**, `code`, and [n] citation markers which become clickable chips.
 */
export function RichText({ text, onCite, activeCite }: {
  text: string; onCite?: (n: number) => void; activeCite?: number | null;
}) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[14.5px] leading-[1.7] text-text">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
        if (isList) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""), onCite, activeCite)}</li>)}
            </Tag>
          );
        }
        if (/^#{1,3}\s/.test(block)) {
          return <h4 key={bi} className="font-semibold text-text">{inline(block.replace(/^#{1,3}\s/, ""), onCite, activeCite)}</h4>;
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, onCite, activeCite)}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string, onCite?: (n: number) => void, activeCite?: number | null): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={k++} className="font-semibold">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k++} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12.5px]">{tok.slice(1, -1)}</code>);
    else {
      const n = Number(tok.slice(1, -1));
      out.push(
        <button key={k++} onClick={() => onCite?.(n)}
          className={`mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded px-1 align-middle text-[10.5px] font-semibold tabular-nums transition-colors ${activeCite === n ? "bg-accent text-white" : "bg-accent-soft text-accent-text hover:bg-accent hover:text-white"}`}
          aria-label={`Source ${n}`}>{n}</button>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
