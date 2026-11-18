# EletsGPT 2.0 — Ingestion Architecture

Status: **designed; implementation in Phase 2.** The source registry, job and log tables, crawl frontier and
dashboard views already exist (Phase 1 and 5).

## Principles
1. **Permission first.** `robots.txt` is fetched and obeyed for every host, and a source cannot turn this off. No
   authentication, paywall, CAPTCHA or rate-limit bypass. A descriptive User-Agent with a contact URL. Each host is
   rate limited (default 0.5 req/s), with exponential backoff on 429/5xx and a host-wide pause after repeated errors.
2. **Provenance on every record.** Each document stores its original URL, canonical URL, source, discovery path,
   fetch time, HTTP validators (ETag/Last-Modified) and extraction method.
3. **Idempotent and incremental.** URLs are normalized and hashed; the content hash decides whether a fetch is new,
   updated or unchanged. Re-running a job never creates duplicates.
4. **Never silently discard.** An update creates a new `document_versions` row and deactivates old chunks. Deletion is
   only a status change, with an audit entry.

## Pipeline

```
 Source (registry)
   │  schedule (Celery beat, per-source cron) or manual trigger → ingestion_jobs(queued)
   ▼
 1. Discover ── robots.txt → sitemap index/sitemaps (lastmod) → RSS/Atom → WP REST (/wp-json/wp/v2/posts,
   │             only if exposed publicly and not disallowed) → bounded link crawl (same host, allowed paths)
   │             → upsert crawl_urls(pending), skipping URLs whose sitemap lastmod is unchanged
   ▼
 2. Fetch ──── conditional GET (If-None-Match / If-Modified-Since); 304 → not_modified
   │           retries: 3 with backoff; failures → crawl_urls.next_retry_at
   ▼
 3. Extract ── HTML: trafilatura (main body) + JSON-LD/OpenGraph/meta for headline, author, dates, section;
   │           canonical <link rel=canonical>; images (src, alt, figcaption)
   │           WP API: rendered content + embedded author/categories/featured media
   │           PDF: PyMuPDF per page; pages with no text layer → OCR (Tesseract/ocrmypdf); tables → pdfplumber
   │           YouTube: see below
   ▼
 4. Normalize ─ Unicode NFKC, whitespace, boilerplate removal (share bars, related posts), language detection,
   │            vertical inherited from source; dates → UTC
   ▼
 5. Dedupe ─── exact: content_hash; canonical: canonical_url; near-dup: MinHash/SimHash on shingles (threshold 0.9)
   │           duplicates → documents.status = duplicate, duplicate_of = original (kept for provenance)
   ▼
 6. Enrich ─── entity extraction (organisations, people + designations, events, departments, states, topics) using
   │           rules + gazetteers first, LLM-assisted extraction optional and cached; writes document_entities
   ▼
 7. Chunk + index (Phase 3) → chunks, chunk_embeddings, FTS is automatic (generated tsvector)
```

Each stage is a separate Celery task, chained per URL, so a failure in one URL never fails the job. Job `stats` and
`ingestion_logs` are updated as work proceeds, and the dashboard reads them directly.

## Initial source registry (seeded by migration)

| Source | Type | Vertical | Discovery |
|---|---|---|---|
| eletsonline.com | website | general | robots → sitemap → RSS → WP REST |
| bfsi.eletsonline.com | website | bfsi | same |
| egov.eletsonline.com | website | egov | same |
| digitallearning.eletsonline.com | website | digital_learning | same |
| events.eletsonline.com | website | events | sitemap + links |
| magazine.eletsonline.com | pdf_collection | magazine | sitemap + issue pages → linked PDFs |
| youtube.com/@eletsvideos | youtube_channel | general | YouTube Data API v3 (key required) |

These are candidates, not guarantees. Phase 2 begins with a probe job per source that records what is reachable
(robots rules, sitemaps, feeds, WP API) in `ingestion_logs`, before any bulk crawl.

## YouTube pipeline
- The video list comes from the **YouTube Data API v3** (`channels` → uploads playlist → `playlistItems`, `videos`),
  which needs `YOUTUBE_API_KEY`. Without a key the source shows "not configured"; we do not scrape the channel page.
- Transcripts: only **published caption tracks** that are publicly available for the video are retrieved. Owner
  captions via the Data API `captions` endpoint need OAuth from the channel owner. Where only auto-generated public
  captions are accessible, they are used and marked `metadata.caption_kind = auto`. No media download, no circumvention.
  Videos without accessible captions are indexed by title and description only, and labelled that way.
- Segmentation: caption cues are merged into ~45–90 s segments on sentence boundaries. Each chunk keeps
  `timestamp_start` and `timestamp_end`. Citations link to `https://www.youtube.com/watch?v=<id>&t=<start>s`.

## PDF and magazine pipeline
- Only PDFs linked from accessible pages and not disallowed by robots are downloaded, with a size cap (default 50 MB),
  a page cap and MIME sniffing. Processing runs in a sandboxed worker with no network access.
- Text and tables are extracted per page. Chunks never cross page boundaries, so `page_number` citations stay exact.
  Citations link to `<pdf_url>#page=<n>`.
- Documents with heavy OCR are flagged (`metadata.ocr_ratio`) so their answers can carry lower confidence.

## Scheduling and operations
- Per-source cron in `sources.schedule_cron`, read by a Celery beat scheduler that loads from the database.
- Concurrency: one active job per source (Postgres advisory lock); a global worker concurrency cap.
- Retry policy: fetch errors are retried 3 times with exponential backoff and jitter; URLs that still fail are retried
  on the next scheduled run, up to `max_retries` (default 5), then marked `failed` and listed in the dashboard.
- Reindex: chunks are re-embedded for a new model next to the old embeddings; retrieval switches only after the new
  index is complete.

## Legal and ethical guardrails
- Content is used only to answer questions with attribution and links back to Elets. Answers quote excerpts
  sparingly; they do not republish full articles.
- A source can be disabled at any time, and its documents can be removed from retrieval (via status) without losing history.
