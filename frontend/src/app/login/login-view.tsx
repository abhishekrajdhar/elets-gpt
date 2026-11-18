"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, Fingerprint, ScanSearch } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { BrandMark, BrandName } from "@/components/brand";
import { Button, Callout, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Me } from "@/lib/types";

function safeNext(next: string | null) {
  // Only allow same-site relative paths (prevents open redirects).
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/workspace";
}

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await api<Me>("/auth/login", { method: "POST", body: { email, password } });
      qc.setQueryData(["me"], me);
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{ background: "radial-gradient(60% 50% at 20% 10%, var(--accent-soft), transparent 70%), radial-gradient(50% 40% at 90% 90%, var(--info-soft), transparent 70%)" }} />
        <div className="relative flex items-center gap-2.5">
          <BrandMark />
          <BrandName className="text-lg" />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-text">
            Answers from Elets&apos; published knowledge, with sources you can check.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Coverage from e-Governance, BFSI, Digital Learning, Healthcare, events and magazines is indexed with provenance.
            Every answer cites the original article, page or video timestamp.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              [BookOpenCheck, "Citations that resolve", "Links come only from indexed source records, never from model text."],
              [ScanSearch, "Transparent retrieval", "Inspect dense, BM25, fusion and reranking for any query."],
              [Fingerprint, "Permission-aware", "Role-based access is enforced on every query."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof BookOpenCheck;
              return (
                <li key={t as string} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent"><I className="h-4 w-4" /></span>
                  <span><span className="block font-medium text-text">{t as string}</span><span className="text-muted">{d as string}</span></span>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-muted">Elets Technomedia · Internal knowledge platform</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><BrandMark /><BrandName className="text-lg" /></div>
          <h2 className="text-xl font-semibold tracking-tight text-text">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use the account your administrator created for you.</p>
          <div className="mt-6 space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" autoFocus />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <Callout tone="danger">{error}</Callout>}
            <Button type="submit" variant="primary" className="w-full" loading={loading}>Sign in</Button>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted">
            No self-service sign-up. Accounts are provisioned by an administrator, and every sign-in is audited.
          </p>
        </form>
      </main>
    </div>
  );
}
