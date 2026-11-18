"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, X, XCircle } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/format";

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "icon";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }
>(function Button({ className, variant = "secondary", size = "md", loading, disabled, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors select-none",
        "disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" && "h-8 px-2.5 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "icon" && "h-8 w-8 text-sm",
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover shadow-card",
        variant === "secondary" && "bg-surface border border-border text-text hover:bg-surface-2 shadow-card",
        variant === "outline" && "border border-border-strong text-text hover:bg-surface-2",
        variant === "ghost" && "text-text-2 hover:bg-surface-2 hover:text-text",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ Inputs */

const fieldBase =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted " +
  "transition-shadow focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--ring)] " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, "py-2 leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-9 pr-8 appearance-none bg-no-repeat", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7385' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 10px center",
      }}
      {...props}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, className }: {
  label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-[13px] font-medium text-text-2">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> :
        hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-border-strong", disabled && "opacity-50 cursor-not-allowed")}>
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

/* ------------------------------------------------------------------ Display */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "sample";

const toneCls: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-2 border-border",
  accent: "bg-accent-soft text-accent-text border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  sample: "bg-sample-soft text-sample border-transparent",
};

export function Badge({ tone = "neutral", children, className, title }: {
  tone?: Tone; children: ReactNode; className?: string; title?: string;
}) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
      toneCls[tone], className)}>
      {children}
    </span>
  );
}

export function SampleBadge() {
  return <Badge tone="sample" title="Fictional sample data for UI review — not Elets content">SAMPLE</Badge>;
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } &
  React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, description, actions, className }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-text">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: {
  title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "muted";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-card">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight",
        tone === "muted" ? "text-muted" : "text-text")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-muted", className)} />;
}

export function EmptyState({ icon, title, description, action, className }: {
  icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">{icon}</div>}
      <div className="text-sm font-semibold text-text">{title}</div>
      {description && <div className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "info", title, children, className, icon }: {
  tone?: "info" | "warning" | "danger" | "success" | "sample"; title?: ReactNode; children?: ReactNode;
  className?: string; icon?: ReactNode;
}) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "danger" ? XCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed",
      tone === "info" && "border-info/20 bg-info-soft text-text-2",
      tone === "warning" && "border-warning/25 bg-warning-soft text-text-2",
      tone === "danger" && "border-danger/25 bg-danger-soft text-text-2",
      tone === "success" && "border-success/25 bg-success-soft text-text-2",
      tone === "sample" && "border-sample/25 bg-sample-soft text-text-2", className)}>
      <span className={cn("mt-0.5 shrink-0",
        tone === "info" && "text-info", tone === "warning" && "text-warning", tone === "danger" && "text-danger",
        tone === "success" && "text-success", tone === "sample" && "text-sample")}>
        {icon ?? <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        {title && <div className="font-semibold text-text">{title}</div>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}

/** Shown wherever a feature's engine phase hasn't shipped. Never fakes output. */
export function NotEnabled({ feature, phase, children, compact }: {
  feature: string; phase: number; children?: ReactNode; compact?: boolean;
}) {
  if (compact) {
    return <Badge tone="warning" title={`${feature} ships in Phase ${phase}`}>Phase {phase}</Badge>;
  }
  return (
    <Callout tone="warning" title={`${feature} is not enabled yet`}>
      This ships in <b>Phase {phase}</b>. Nothing on this screen is simulated. {children}
    </Callout>
  );
}

export function Forbidden({ permission }: { permission: string }) {
  return (
    <EmptyState icon={<Lock className="h-5 w-5" />} title="You don't have access to this area"
      description={<>This page requires the <code className="rounded bg-surface-2 px-1">{permission}</code> permission. Ask an administrator to change your role.</>} />
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <EmptyState icon={<XCircle className="h-5 w-5 text-danger" />} title="Couldn't load this data" description={msg}
      action={onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>} />
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({ value, onChange, items, className }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number; hidden?: boolean }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-border scroll-thin", className)}>
      {items.filter((i) => !i.hidden).map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cn("relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === i.value ? "border-accent text-text" : "border-transparent text-muted hover:text-text")}>
          {i.label}
          {i.count !== undefined && (
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular-nums text-muted">{i.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto scroll-thin", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-border bg-surface-2/60 px-4 py-2.5 text-left text-xs font-medium text-muted whitespace-nowrap", className)}>{children}</th>;
}
export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("border-b border-border px-4 py-3 align-middle text-text-2", className)}>{children}</td>;
}

export function Pagination({ total, limit, offset, onChange }: {
  total: number; limit: number; offset: number; onChange: (offset: number) => void;
}) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[13px] text-muted">
      <span>{offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Dialog */

export function Dialog({ open, onClose, title, description, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode;
  footer?: ReactNode; wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id}
        className={cn("w-full rounded-2xl border border-border bg-surface shadow-pop", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 id={id} className="text-base font-semibold text-text">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Toasts */

type Toast = { id: number; tone: "success" | "danger" | "info" | "warning"; title: string; body?: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto rounded-xl border border-border bg-surface px-4 py-3 shadow-pop">
            <div className="flex items-start gap-2.5">
              <span className={cn("mt-0.5", t.tone === "success" && "text-success", t.tone === "danger" && "text-danger",
                t.tone === "info" && "text-info", t.tone === "warning" && "text-warning")}>
                {t.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : t.tone === "danger" ? <XCircle className="h-4 w-4" /> :
                  t.tone === "warning" ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text">{t.title}</div>
                {t.body && <div className="mt-0.5 text-[13px] text-muted">{t.body}</div>}
              </div>
              <button className="text-muted hover:text-text" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))}
                aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------------ Misc */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}

export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-text-2">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
