# EletsGPT 2.0 — Implementation Roadmap

Requested order: **Phase 1 and Phase 5 first**, then pause for direction.

| Phase | Scope | Status |
|---|---|---|
| 1 — Foundation | Repo, FastAPI app, full DB schema and migrations, auth (Argon2 + JWT cookie), RBAC, source registry with the 7 seeded sources, audit log, settings store, rate limiting, capabilities API, Docker Compose, tests | **Done** |
| 5 — Frontend | Next.js shell; AI Workspace (conversations, SSE client, evidence panel, filters); Knowledge Explorer (FTS search, facets, document + chunk view); Retrieval Inspector (stage view + trace history); Analytics & Evaluation (real metrics, empty states); Knowledge Management (sources CRUD, jobs, logs, documents, index health); Administration (users, roles, models, embeddings, retrieval, limits, API status, audit) | **Done**: every screen is wired to real APIs. Features whose engine phase hasn't shipped show an explicit "not enabled yet" state |
| 2 — Knowledge acquisition | Celery + beat; probe jobs; robots/sitemap/RSS/WP REST discovery; fetch with conditional GET; trafilatura extraction; dedupe; versioning; PDF + OCR; YouTube Data API + captions; entity extraction | Next (awaiting go-ahead) |
| 3 — Core RAG | Chunker (structure-aware, page- and timestamp-preserving); embedding adapters; per-model HNSW; dense + FTS lanes; RRF; cross-encoder rerank; inspector trace persistence | Planned |
| 4 — Advanced intelligence | Query classifier + router; metadata filters; multi-hop via entities/relations; SQL lane with validator + RO role; citation verification; grounded streaming answers; abstention | Planned |
| 6 — Evaluation | Benchmark builder with human review (150+ verified questions, once the corpus allows); strategy comparisons (8 configs); retrieval and answer metrics; CSV/JSON/Markdown export; regression gate in CI | Planned |
| 7 — Production readiness | OpenTelemetry traces, security tests (authz matrix, injection corpus), load tests, caching, deployment hardening, backups runbook | Planned |

## Phase 2 entry checklist
- [ ] Decide crawl budget per source (max pages / day) and politeness rate.
- [ ] Provide `YOUTUBE_API_KEY` (optional; without it YouTube stays "not configured").
- [ ] Confirm that Elets' terms of use allow indexing for internal Q&A with attribution. Elets owns this content, so
      written internal approval is enough.
- [ ] Choose the default embedding model (local `bge-m3` vs hosted). This affects worker sizing.

## Definition of done for each feature
Backend endpoint, frontend connected, input validation, error handling, automated tests, verified manually in the
running app.
