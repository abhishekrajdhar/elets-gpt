import { cn } from "@/lib/format";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-card", className)}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 6.5h10M5 12h7M5 17.5h10" />
        <circle cx="18.5" cy="12" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight text-text", className)}>
      EletsGPT <span className="text-accent">2.0</span>
    </span>
  );
}
