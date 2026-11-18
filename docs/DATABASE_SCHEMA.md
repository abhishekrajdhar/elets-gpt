# EletsGPT 2.0 — Database Schema

PostgreSQL 17 with the `vector` (pgvector), `pg_trgm` and `unaccent` extensions. Alembic manages every change
(`backend/alembic/versions`). Primary keys are UUIDs, except for high-volume append-only logs, which use `bigint identity`.
Timestamps are `timestamptz` in UTC.

## Entity overview

```
users ─┬─< conversations ─< messages >─ retrieval_traces
       ├─< audit_logs
       └─< usage_events

sources ─< ingestion_jobs ─< ingestion_logs
   │  └──< crawl_urls ─────────────┐
   └────< documents ─< chunks ─< chunk_embeddings (per embedding model)
              │  └─< document_versions
              ├─< document_entities >─ entities
              └─< document_relations (document ↔ document)

eval_datasets ─< eval_questions
      └──────< eval_runs ─< eval_results >─ eval_questions

app_settings (key → jsonb)
```

## Identity and access

### `users`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | text | unique on `lower(email)` |
| full_name | text | |
| password_hash | text | Argon2id |
| role | `user_role` enum | `admin`, `knowledge_manager`, `analyst`, `viewer` |
| is_active | bool | inactive users cannot sign in; their existing tokens are rejected |
| token_version | int | incremented to revoke all of a user's sessions (on password change or deactivation) |
| last_login_at, created_at, updated_at | timestamptz | |

### RBAC (defined in code: `app/core/rbac.py`)
| permission | admin | knowledge_manager | analyst | viewer |
|---|:-:|:-:|:-:|:-:|
| `chat:use` | ✓ | ✓ | ✓ | ✓ |
| `knowledge:read` | ✓ | ✓ | ✓ | ✓ |
| `inspector:use` | ✓ | ✓ | ✓ | |
| `analytics:read` | ✓ | ✓ | ✓ | |
| `eval:manage` | ✓ | ✓ | | |
| `knowledge:manage` (documents, reprocess) | ✓ | ✓ | | |
| `sources:manage` | ✓ | ✓ | | |
| `settings:manage` | ✓ | | | |
| `users:manage` | ✓ | | | |
| `audit:read` | ✓ | | | |
| max document access level | restricted | restricted | internal | public |

### `audit_logs`
`id bigint`, `actor_id uuid null`, `actor_email text`, `action text` (e.g. `source.update`), `resource_type`,
`resource_id`, `details jsonb`, `ip inet null`, `user_agent text`, `created_at`. Indexed on `(created_at desc)` and
`(resource_type, resource_id)`. Rows are append-only; no API updates or deletes them.

## Knowledge acquisition

### `sources`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name, slug | text | slug is unique |
| source_type | `source_type` enum | `website`, `wordpress`, `rss`, `sitemap`, `youtube_channel`, `pdf_collection` |
| base_url | text | |
| vertical | text | `egov`, `bfsi`, `digital_learning`, `healthcare`, `events`, `magazine`, `general` |
| access_level | `access_level` enum | default level for documents from this source |
| enabled | bool | |
| crawl_config | jsonb | `max_pages`, `rate_limit_rps`, `respect_robots` (always enforced as true), `allowed_paths`, `blocked_paths`, `discovery` (`sitemap`/`rss`/`wp_api`/`links`), `user_agent` |
| schedule_cron | text null | e.g. `0 2 * * *`; validated with croniter |
| last_crawl_started_at, last_crawl_finished_at, last_success_at | timestamptz | |
| last_error | text | |
| created_by | uuid fk users | |

### `ingestion_jobs`
`id`, `source_id fk`, `job_type` (`discover`, `crawl`, `incremental`, `reindex`, `youtube`, `pdf`), `status`
(`queued`, `running`, `succeeded`, `partial`, `failed`, `cancelled`), `trigger` (`manual`, `schedule`, `api`),
`requested_by`, `celery_task_id`, `stats jsonb` (`discovered`, `fetched`, `new`, `updated`, `unchanged`,
`duplicates`, `failed`, `skipped_robots`), `error`, `started_at`, `finished_at`, `created_at`.

### `ingestion_logs`
`id bigint`, `job_id fk`, `level` (`debug`…`error`), `message`, `url`, `context jsonb`, `created_at`.

### `crawl_urls` (the crawl frontier, used for incremental crawling)
`id`, `source_id`, `url`, `url_hash` (sha256 of the normalized URL; unique together with `source_id`), `canonical_url`,
`discovered_via` (`sitemap`, `rss`, `wp_api`, `link`, `youtube_api`, `manual`), `status` (`pending`, `fetched`,
`not_modified`, `failed`, `skipped`, `blocked_robots`), `http_status`, `etag`, `last_modified`, `content_hash`,
`sitemap_lastmod`, `retry_count`, `next_retry_at`, `last_fetched_at`, `error`, `document_id fk null`.

## Corpus

### `documents`
| column | notes |
|---|---|
| id, source_id | |
| doc_type | `article`, `video`, `pdf`, `magazine_issue`, `event_page`, `page` |
| external_id | WordPress post id, YouTube video id, etc. Unique together with `source_id` when present |
| title, url, canonical_url | `canonical_url` is unique among active documents. **Every citation resolves to one of these URLs** |
| author, category, tags text[], language | |
| vertical | inherited from the source; can be overridden per document |
| published_at, source_updated_at | |
| summary, content_text | normalized full text |
| content_hash | sha256 of normalized text, used to detect duplicates and updates |
| word_count, page_count, duration_seconds | |
| video_id, channel_name | video documents |
| event_name, event_date | event documents, or articles linked to an event |
| access_level | |
| status | `active`, `superseded`, `duplicate`, `failed`, `deleted` (soft delete) |
| duplicate_of | fk documents, null |
| version | incremented when content changes; the previous text goes to `document_versions` |
| is_sample | true only for UI-review sample data |
| metadata | jsonb: images (`src`, `alt`, `caption`), WP categories, OCR flags, extraction method |
| search_tsv | generated `tsvector`: title (weight A), summary (B), content (C). GIN index |

Indexes: `(vertical, published_at desc)`, `(source_id)`, `(doc_type)`, `(status)`, trigram index on `title`.

### `document_versions`
`id`, `document_id`, `version`, `title`, `content_text`, `content_hash`, `captured_at`. Reindexing never deletes
documents: changed content creates a new version, and old chunks are deactivated, not dropped.

### `chunks`
| column | notes |
|---|---|
| id, document_id, document_version, chunk_index | unique `(document_id, document_version, chunk_index)` |
| text, context_prefix | `context_prefix` = "Title — Section" header prepended for embedding and lexical search |
| token_count, char_start, char_end | |
| page_number | PDFs |
| timestamp_start, timestamp_end | seconds, for video transcripts |
| section_heading | |
| is_active | false for chunks of superseded versions |
| metadata | jsonb (speaker turns, table flag, …) |
| search_tsv | generated from `context_prefix` (A) + `text` (B); GIN index |

### `chunk_embeddings`
`chunk_id fk`, `embedding_model text`, `dim int`, `embedding vector` (no fixed dimension), `created_at`; PK
`(chunk_id, embedding_model)`. Each embedding model gets a partial HNSW expression index, for example
`CREATE INDEX … USING hnsw ((embedding::vector(1024)) vector_cosine_ops) WHERE embedding_model = 'bge-m3'`.
This lets a new embedding model be indexed next to the old one and switched over atomically, with no data lost.

### Entities and relations (multi-hop without a graph database)
- `entities`: `id`, `entity_type` (`organisation`, `person`, `event`, `department`, `state`, `topic`), `name`,
  `normalized_name`, `attributes jsonb` (e.g. `designation`, `parent_org`), unique `(entity_type, normalized_name)`.
- `document_entities`: `(document_id, entity_id, role)` PK; `role` ∈ `speaker`, `author`, `mentioned`,
  `organiser`, `subject`; `designation` (speaker designation at that time), `mention_count`, `first_chunk_id`.
- `document_relations`: `(from_document_id, to_document_id, relation_type)` PK; `relation_type` ∈ `links_to`,
  `same_event`, `video_of`, `follow_up`, `part_of_issue`.

The metadata fields the retrieval spec requires (`speaker_name`, `organisation_name`, `state`, `topic`, …) resolve
through these tables. `document_id`, `chunk_id`, `page_number`, `video_id` and `timestamp_*` are columns.

## Conversation and retrieval

- `conversations`: `id`, `user_id`, `title`, `filters jsonb` (vertical/date filters chosen in the UI), `archived`, timestamps.
- `messages`: `id`, `conversation_id`, `role` (`user`/`assistant`), `content`, `status` (`complete`, `streaming`,
  `abstained`, `error`), `query_type`, `citations jsonb` (each holds `document_id`, `chunk_id`, URL, title, date,
  excerpt, page/timestamp, `verified` flag), `trace_id`, `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`,
  `latency_ms`, `feedback smallint`, `error`, `created_at`.
- `retrieval_traces`: the full pipeline record shown in the Retrieval Inspector. Fields: `query`, `query_type`,
  `classification`, `filters`, `config`, `dense_results`, `lexical_results`, `fused_results`, `reranked_results`,
  `final_evidence`, `citation_checks`, `timings`, `total_latency_ms`, `user_id`, `created_at`.
- `usage_events`: one row per chat, search, inspect or eval call. Fields: `event_type`, `model`, `prompt_tokens`,
  `completion_tokens`, `embedding_tokens`, `cost_usd`, `latency_ms`, `retrieval_latency_ms`, `success`, `error_code`.
  Analytics are computed only from this table and `messages`.

## Evaluation
- `eval_datasets`: `id`, `name`, `description`, `version`, `created_by`, `created_at`.
- `eval_questions`: `id`, `dataset_id`, `question`, `category` (`factual`, `quantitative`, `comparative`,
  `temporal`, `multi_hop`, `entity`, `unanswerable`), `expected_answer`, `expected_document_ids uuid[]`,
  `expected_chunk_ids uuid[]`, `should_abstain`, `review_status` (`draft`, `verified`, `rejected`), `reviewed_by`,
  `reviewed_at`, `notes`.
- `eval_runs`: `id`, `dataset_id`, `name`, `strategy` (`baseline`, `dense`, `bm25`, `hybrid`, `hybrid_rrf`,
  `hybrid_rrf_rerank`, `metadata_aware`, `sql`), `config jsonb`, `status`, `metrics jsonb` (aggregate),
  `started_at`, `finished_at`, `created_by`.
- `eval_results`: `id`, `run_id`, `question_id`, `retrieved jsonb`, `answer`, `metrics jsonb` (per question),
  `latency_ms`, `tokens`, `judge jsonb` (automated, supplementary), `human_verdict`, `human_notes`.

## Settings
`app_settings(key text pk, value jsonb, updated_by, updated_at)`. Keys: `llm`, `embedding`, `reranker`,
`retrieval`, `usage_limits`. Each value is validated by a Pydantic model and merged over defaults. Secrets are never stored.

## Read-only analytics role (Phase 4)
The `eletsgpt_analytics_ro` role gets `SELECT` only on the `analytics_*` views (documents by vertical/date, entity
mention counts, events). The SQL lane connects as this role with `statement_timeout = 3s`.

## Backups
See `DEPLOYMENT.md` §Backups. Use `pg_dump -Fc` daily plus WAL archiving or managed point-in-time recovery, and test
restores monthly.
