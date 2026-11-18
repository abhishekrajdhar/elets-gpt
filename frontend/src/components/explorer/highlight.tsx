import { Fragment } from "react";

/** Render backend ts_headline snippets (<<match>>) as <mark> without using innerHTML. */
export function Highlight({ text }: { text: string | null }) {
  if (!text) return null;
  const parts = text.split(/(<<.*?>>)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("<<") && p.endsWith(">>") ? <mark key={i} className="hl">{p.slice(2, -2)}</mark> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}
