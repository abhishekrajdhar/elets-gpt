"use client";

import { useMutation } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronsUpDown,
  Database,
  KeyRound,
  Library,
  LogOut,
  Menu,
  MessageSquareText,
  ScanSearch,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { BrandMark, BrandName } from "@/components/brand";
import { Button, Dialog, Field, Input, Spinner, useToast } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useCapabilities, useLogout, useMe } from "@/lib/auth";
import { cn, ROLE_LABELS } from "@/lib/format";

const NAV = [
  { href: "/workspace", label: "AI Workspace", icon: MessageSquareText, perm: ["chat:use"] },
  { href: "/explorer", label: "Knowledge Explorer", icon: Library, perm: ["knowledge:read"] },
  { href: "/inspector", label: "Retrieval Inspector", icon: ScanSearch, perm: ["inspector:use"] },
  { href: "/analytics", label: "Analytics & Evaluation", icon: BarChart3, perm: ["analytics:read"] },
  { href: "/knowledge", label: "Knowledge Management", icon: Database, perm: ["knowledge:read"] },
  { href: "/admin", label: "Administration", icon: ShieldCheck, perm: ["users:manage", "settings:manage", "audit:read"] },
];

function EngineStatus() {
  const { data } = useCapabilities();
  if (!data) return null;
  const feats = Object.values(data.features);
  const live = feats.filter((f) => f.enabled).length;
  const nextPhase = Math.min(...feats.filter((f) => !f.enabled).map((f) => f.phase));
  return (
    <div className="mx-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
        <span>Platform status</span>
        <span className="tabular-nums">{live}/{feats.length} live</span>
      </div>
      <div className="mt-2 flex gap-0.5">
        {feats.map((f) => (
          <span key={f.label} title={`${f.label} — ${f.enabled ? "live" : `Phase ${f.phase}`}`}
            className={cn("h-1.5 flex-1 rounded-full", f.enabled ? "bg-success" : "bg-border-strong")} />
        ))}
      </div>
      {Number.isFinite(nextPhase) && (
        <div className="mt-1.5 text-[11px] text-muted">Next: Phase {nextPhase} engines</div>
      )}
    </div>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const m = useMutation({
    mutationFn: () => api("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } }),
    onSuccess: () => {
      toast({ tone: "success", title: "Password changed", body: "Other sessions have been signed out." });
      setCurrent(""); setNext(""); onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} title="Change password"
      description="At least 12 characters, mixing three of: lowercase, uppercase, digits, symbols."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Update password</Button></>}>
      <div className="space-y-4">
        <Field label="Current password"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" error={m.error ? errorMessage(m.error) : null}>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Dialog>
  );
}

function UserMenu() {
  const { data: me } = useMe();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  if (!me) return null;
  const initials = me.full_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-text">{me.full_name}</span>
          <span className="block truncate text-[11px] text-muted">{ROLE_LABELS[me.role]}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 rounded-xl border border-border bg-surface p-1 shadow-pop">
          <div className="border-b border-border px-3 py-2 text-xs text-muted truncate">{me.email}</div>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-2 hover:bg-surface-2"
            onClick={() => { setOpen(false); setPwOpen(true); }}><KeyRound className="h-4 w-4" /> Change password</button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft"
            onClick={logout}><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      )}
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const items = NAV.filter((n) => n.perm.some((p) => me?.permissions.includes(p)));
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <BrandMark className="h-7 w-7" />
        <BrandName className="text-[15px]" />
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 px-3">
        {items.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate}
              className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                active ? "bg-accent-soft text-accent-text" : "text-text-2 hover:bg-surface-2 hover:text-text")}>
              <n.icon className="h-[17px] w-[17px] shrink-0" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <EngineStatus />
      <div className="mt-3 border-t border-border pt-3"><UserMenu /></div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error, isLoading } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [error, pathname, router]);

  if (isLoading || (error instanceof ApiError && error.status === 401)) {
    return <div className="flex h-screen items-center justify-center"><Spinner className="h-5 w-5" /></div>;
  }
  if (error || !me) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-sm font-semibold text-text">Can&apos;t reach the EletsGPT API</div>
        <p className="max-w-sm text-[13px] text-muted">{errorMessage(error)}. Check that the backend is running on the configured BACKEND_URL.</p>
        <Button size="sm" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 border-r border-border bg-surface lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] border-r border-border bg-surface shadow-pop">
            <button className="absolute right-3 top-4 text-muted" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-4 w-4" /></Button>
          <BrandName className="text-[15px]" />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto scroll-thin">{children}</main>
      </div>
    </div>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}
