import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const VERTICAL_LABELS: Record<string, string> = {
  general: "General",
  egov: "e-Governance",
  bfsi: "BFSI",
  digital_learning: "Digital Learning",
  healthcare: "Healthcare",
  events: "Events",
  magazine: "Magazine",
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  article: "Article",
  video: "Video",
  pdf: "PDF",
  magazine_issue: "Magazine issue",
  event_page: "Event page",
  page: "Page",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  website: "Website",
  wordpress: "WordPress",
  rss: "RSS feed",
  sitemap: "Sitemap",
  youtube_channel: "YouTube channel",
  pdf_collection: "PDF collection",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  knowledge_manager: "Knowledge manager",
  analyst: "Analyst",
  viewer: "Viewer",
};

export const ENTITY_LABELS: Record<string, string> = {
  organisation: "Organisation",
  person: "Person",
  event: "Event",
  department: "Department",
  state: "State",
  topic: "Topic",
};

export function label(map: Record<string, string>, key: string | null | undefined) {
  if (!key) return "—";
  return map[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

export function relTime(v: string | null | undefined) {
  if (!v) return "—";
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(v);
}

export function fmtNum(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function fmtTimestamp(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
