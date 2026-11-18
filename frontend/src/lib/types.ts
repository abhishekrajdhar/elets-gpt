// Mirrors backend Pydantic schemas (backend/app/schemas).

export type Role = "admin" | "knowledge_manager" | "analyst" | "viewer";
export type AccessLevel = "public" | "internal" | "restricted";
export type Vertical = "general" | "egov" | "bfsi" | "digital_learning" | "healthcare" | "events" | "magazine";
export type DocType = "article" | "video" | "pdf" | "magazine_issue" | "event_page" | "page";
export type DocStatus = "active" | "superseded" | "duplicate" | "failed" | "deleted";
export type SourceType = "website" | "wordpress" | "rss" | "sitemap" | "youtube_channel" | "pdf_collection";
export type JobStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Me {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  permissions: string[];
  access_levels: AccessLevel[];
}

export type UserRow = Omit<Me, "permissions" | "access_levels">;

export interface Feature {
  enabled: boolean;
  phase: number;
  label: string;
}
export interface Capabilities {
  features: Record<string, Feature>;
}

export interface CrawlConfig {
  discovery?: string[];
  max_pages?: number;
  rate_limit_rps?: number;
  respect_robots?: true;
  allowed_paths?: string[];
  blocked_paths?: string[];
  max_pdf_mb?: number;
  ocr?: string;
  max_videos?: number;
  captions?: string;
}

export interface JobBrief {
  id: string;
  job_type: string;
  status: JobStatus;
  created_at: string;
  finished_at: string | null;
}

export interface Source {
  id: string;
  name: string;
  slug: string;
  source_type: SourceType;
  base_url: string;
  vertical: Vertical;
  access_level: AccessLevel;
  enabled: boolean;
  description: string | null;
  crawl_config: CrawlConfig;
  schedule_cron: string | null;
  last_crawl_started_at: string | null;
  last_crawl_finished_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  failed_url_count: number;
  latest_job: JobBrief | null;
  requires_credentials: string[];
  credentials_configured: boolean;
}

export interface Job {
  id: string;
  source_id: string;
  source_name: string | null;
  job_type: string;
  status: JobStatus;
  trigger: string;
  stats: Record<string, number>;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface LogRow {
  id: number;
  job_id: string;
  level: "debug" | "info" | "warning" | "error";
  message: string;
  url: string | null;
  context: Record<string, unknown>;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  url: string;
  canonical_url: string;
  doc_type: DocType;
  vertical: Vertical;
  source_id: string;
  source_name: string;
  author: string | null;
  category: string | null;
  published_at: string | null;
  status: DocStatus;
  access_level: AccessLevel;
  word_count: number;
  is_sample: boolean;
  snippet: string | null;
  rank: number | null;
}

export interface EntityRef {
  id: string;
  entity_type: string;
  name: string;
  role: string;
  designation: string | null;
  mention_count: number;
}

export interface DocumentDetail extends DocumentItem {
  summary: string | null;
  content_text: string;
  tags: string[];
  language: string | null;
  source_updated_at: string | null;
  page_count: number | null;
  duration_seconds: number | null;
  video_id: string | null;
  channel_name: string | null;
  event_name: string | null;
  event_date: string | null;
  version: number;
  duplicate_of: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  entities: EntityRef[];
  chunk_count: number;
  active_chunk_count: number;
  embedding_models: string[];
  version_count: number;
}

export interface ChunkRow {
  id: string;
  document_id: string;
  document_version: number;
  chunk_index: number;
  text: string;
  context_prefix: string | null;
  token_count: number;
  char_start: number | null;
  char_end: number | null;
  page_number: number | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
  section_heading: string | null;
  is_active: boolean;
  content_hash: string;
  metadata: Record<string, unknown>;
  created_at: string;
  embedding_models: string[];
}

export interface FacetBucket {
  value: string;
  count: number;
}
export interface Facets {
  total: number;
  verticals: FacetBucket[];
  doc_types: FacetBucket[];
  years: FacetBucket[];
  sources: { id: string; name: string; count: number }[];
}

export interface EntityRow {
  id: string;
  entity_type: string;
  name: string;
  document_count: number;
}

export interface ChatFilters {
  verticals: Vertical[];
  date_from: string | null;
  date_to: string | null;
  doc_types: string[];
}

export interface Citation {
  index: number;
  document_id: string;
  chunk_id: string;
  title: string;
  url: string;
  published_at: string | null;
  excerpt: string;
  page_number?: number | null;
  timestamp_start?: number | null;
  verified: boolean;
  source_name?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "abstained" | "error";
  query_type: string | null;
  citations: Citation[];
  related_questions: string[];
  trace_id: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: string | null;
  latency_ms: number | null;
  feedback: number | null;
  error_code: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  filters: Partial<ChatFilters>;
  archived: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
}
export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface AuditRow {
  id: number;
  actor_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface ProviderStatus {
  provider: string;
  env_vars: string[];
  configured: boolean;
  missing: string[];
  requires_credentials: boolean;
}

export interface IndexHealth {
  documents: { active: number; by_status: Record<string, number>; without_chunks: number; sample: number };
  chunks: { total: number; active: number };
  embeddings: { model: string; dim: number; chunks: number; coverage: number | null }[];
  crawl_urls: Record<string, number>;
  failed_urls: number;
}

export interface AnalyticsOverview {
  period_days: number;
  corpus: {
    documents: number;
    chunks: number;
    sources: number;
    sample_documents: number;
    by_vertical: FacetBucket[];
    by_doc_type: FacetBucket[];
    by_month: { month: string; count: number }[];
  };
  usage: {
    events: number;
    chat_requests: number;
    failed: number;
    prompt_tokens: number;
    completion_tokens: number;
    embedding_tokens: number;
    cost_usd: number;
    answer_latency_ms: { p50: number | null; p95: number | null };
    retrieval_latency_ms: { p50: number | null; p95: number | null };
    assistant_messages: Record<string, number>;
    abstained: number;
    feedback: { positive: number; negative: number };
  };
  evaluation: { runs: EvalRun[] };
}

export interface EvalRun {
  id: string;
  dataset_id?: string;
  name: string;
  strategy: string;
  status: string;
  metrics: Record<string, number>;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface EvalDataset {
  id: string;
  name: string;
  description: string | null;
  version: number;
  created_at: string;
  questions: { category: string; review_status: string; count: number }[];
}

export interface TraceSummary {
  id: string;
  query: string;
  query_type: string | null;
  total_latency_ms: number | null;
  evidence_count: number;
  created_at: string;
}

export interface PipelineInfo {
  stages: { key: string; label: string; phase: number }[];
  config: {
    retrieval: Record<string, number | string | boolean>;
    reranker: Record<string, number | string | boolean>;
    embedding: Record<string, number | string | boolean>;
  };
}
