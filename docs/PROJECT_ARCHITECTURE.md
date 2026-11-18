# EletsGPT 2.0 — Project Architecture

EletsGPT 2.0 is a standalone knowledge platform for Elets Technomedia. It builds its own corpus from Elets'
publicly accessible web, video and PDF content, and answers questions with citations that can be verified.
It shares no code, data or infrastructure with the earlier EletsGPT.

## 1. Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Repository layout | Monorepo: `backend/`, `frontend/`, `docs/`, `infra/` | One place for API contract changes; one CI. |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (sync, psycopg 3), Alembic | The Python ecosystem has the best ingestion, PDF/OCR and ML tooling. Sync SQLAlchemy keeps the code simple; FastAPI runs sync handlers in a thread pool, and streaming endpoints use async generators. |
| Database | PostgreSQL 17 + pgvector | A single store for relational metadata, vectors (pgvector) and keyword search (FTS). No second system to keep in sync until benchmarks say otherwise. |
| Keyword search | PostgreSQL full-text search (`tsvector`, `ts_rank_cd`) | Good BM25-like ranking without running Elasticsearch. Can be swapped for ParadeDB `pg_search` (true BM25) behind the same interface. |
| Graph | None, for now | Multi-hop runs over relational `entities` / `document_entities` / `document_relations`. A graph DB is only added if benchmarks show a measurable gain. |
| Background jobs | Celery + Redis (Phase 2) | Mature retries, scheduling (beat) and rate limits. Redis also backs API rate limiting. |
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + TanStack Query | Fast navigation, typed API client, cache-aware data fetching. |
| Auth | Email + password (Argon2id) → signed JWT in an `HttpOnly`, `SameSite=Lax` cookie; Bearer tokens are also accepted for API clients | No third-party IdP needed to start. SSO (OIDC) can be added as another login method. |
| Authorization | RBAC: role → permission set, defined in code (`app/core/rbac.py`) | Permissions are reviewed in git. Roles are stored on the user row. |
| LLM / embeddings / reranker | Provider adapters selected by configuration | No vendor lock-in. Admins change providers in Settings; API keys come only from environment variables. |
| Observability | JSON structured logs with request IDs; OpenTelemetry hooks (Phase 7) | Logs are useful from day one; tracing is added once there is a pipeline to trace. |

## 2. System context

```
                ┌──────────────────────────── Browser ────────────────────────────┐
                │ Next.js app (Workspace, Explorer, Inspector, Analytics, Knowledge, Admin) │
                └───────────────┬─────────────────────────────────────────────────┘
                                │ same-origin /api/* (Next.js rewrite → FastAPI)
                    ┌───────────▼───────────┐
                    │  FastAPI  (api/v1)    │── auth, RBAC, rate limits, audit
                    │  ├─ routers           │
                    │  ├─ services          │── retrieval, answer, sql-lane (Phase 3–4)
                    │  └─ providers         │── LLM / embedding / reranker adapters
                    └───┬───────────┬───────┘
                        │           │ enqueue jobs
             ┌──────────▼──┐   ┌────▼─────┐      ┌───────────────────────────┐
             │ PostgreSQL  │   │  Redis   │◄─────┤ Celery workers + beat     │
             │ + pgvector  │   │          │      │ (crawl, parse, chunk,     │
             │ + FTS       │◄──┼──────────┼──────┤  embed, YouTube, PDF/OCR) │
             └─────────────┘   └──────────┘      └──────────┬────────────────┘
                                                            │ polite HTTP (robots.txt, rate limits)
                                                 Elets websites, RSS, sitemaps, WP REST, YouTube
```

## 3. Backend module layout

```
backend/app/
  main.py               app factory, middleware, exception handlers
  core/                 config, logging, security (hashing/JWT), rbac, rate limiting, errors
  db/                   engine/session, declarative base
  models/               SQLAlchemy models (one module per domain)
  schemas/              Pydantic request/response models
  api/v1/               routers: auth, users, sources, jobs, documents, entities, conversations,
                        retrieval, analytics, evaluation, settings, audit, system
  services/             business logic (audit, settings, capabilities, sample data, …)
  ingestion/            (Phase 2) discovery, fetchers, extractors, normalizers, dedup
  retrieval/            (Phase 3–4) dense, lexical, fusion, rerank, classify, sql lane, citations
  providers/            (Phase 3) llm/, embeddings/, rerankers/ adapters
  cli.py                admin bootstrap, sample-data seed/purge
alembic/                migrations
tests/                  pytest suite (runs against a real Postgres test database)
```

Layering rule: routers → services → models. Routers never build SQL for business logic. Services never import FastAPI.

## 4. Frontend layout

```
frontend/src/
  app/login                 sign-in
  app/(app)/workspace       AI Workspace (chat, history, evidence panel)
  app/(app)/explorer        Knowledge Explorer (search, browse, document + chunk inspection)
  app/(app)/inspector       Retrieval Inspector (pipeline stage by stage)
  app/(app)/analytics       Analytics & Evaluation
  app/(app)/knowledge       Knowledge Management (sources, jobs, documents, index health, logs)
  app/(app)/admin           Administration (users, roles, models, retrieval, limits, API, audit)
  components/ui             design-system primitives
  components/…              feature components
  lib/                      typed API client, SSE reader, auth/capability hooks, formatting
```

### Honest states

The backend publishes `GET /api/v1/system/capabilities`, which says which engine features are live
(ingestion worker, retrieval, chat answers, SQL lane, evaluation runs). The UI reads it and shows
"not yet enabled" states. It never shows placeholder numbers. Every metric on screen comes from an API
that queries real tables, and an empty table shows an empty state. Sample data can be loaded through
the CLI for UI review only. It is flagged `is_sample = true`, uses `.invalid` URLs, carries a SAMPLE badge
everywhere it appears, and can be removed in one command.

## 5. Security model (summary)

- Roles: `admin`, `knowledge_manager`, `analyst`, `viewer` (see `DATABASE_SCHEMA.md` §RBAC).
- Document `access_level` (`public` / `internal` / `restricted`) is checked at query time. Each role has a
  maximum level, and every document, chunk and retrieval query is filtered by it.
- Secrets are read only from the environment. The settings API reports *whether* a key is configured, never its value.
- Rate limits use Redis fixed windows (login per IP, chat per user) and fall back to in-process limits when Redis is down.
- All mutating admin and knowledge actions write an `audit_logs` row.
- Retrieved text is treated as untrusted data: it is delimited in prompts, never executed as instructions, and the
  assistant has no tools that publish, send or transact.
- The SQL lane (Phase 4) runs under a read-only database role, on an allowlisted set of views, with a statement timeout.

## 6. Deployment shape

- Docker Compose for local and single-host deployments: `db` (pgvector), `redis`, `backend`, `worker` (Phase 2), `frontend`.
- Production: managed Postgres with pgvector (RDS / Cloud SQL / Neon / Supabase), managed Redis, and the backend and
  frontend as containers (ECS / Cloud Run / Fly / k8s). See `DEPLOYMENT.md`.
- Expected cost profile: one Postgres instance holds the whole corpus (estimated 100k–500k chunks, which fits
  comfortably in pgvector with HNSW). The main variable cost is LLM tokens, which the analytics page tracks.
