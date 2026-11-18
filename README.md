# EletsGPT 2.0

An enterprise knowledge platform for Elets Technomedia. It builds its own corpus from Elets' publicly accessible
websites, magazines and videos, and answers questions with citations you can check (URLs, PDF pages, video timestamps).
It is independent of the earlier EletsGPT.

| | |
|---|---|
| Frontend | Next.js 16 · TypeScript · Tailwind CSS v4 · TanStack Query |
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic |
| Data | PostgreSQL 17 + pgvector + full-text search · Redis |

## Status

**Phases 1 (Foundation) and 5 (Frontend) are implemented.** Every screen talks to real APIs. Features whose engine
belongs to a later phase (crawling, retrieval, grounded answers, evaluation runs) are announced by
`GET /api/v1/system/capabilities`. The UI shows them as "not enabled yet" and never simulates output.
See [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md).

## Quick start

```bash
cp .env.example .env                    # set POSTGRES_PASSWORD
cp backend/.env.example backend/.env    # set DATABASE_URL password, JWT_SECRET, BOOTSTRAP_ADMIN_*
make up                                 # Postgres (pgvector) on :5433, Redis on :6380
make migrate admin                      # schema + 7 seeded Elets sources, first admin
make backend                            # API on :8000  (docs: http://localhost:8000/api/docs)
make frontend                           # UI on http://localhost:3000
```

Optional: `make seed-sample` loads fictional, clearly labelled documents (SAMPLE badge, `.invalid` URLs) so the
Explorer and Analytics screens can be reviewed. Remove them with `make purge-sample`.

Full guide: [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) · Production: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Documentation

- [Project architecture](docs/PROJECT_ARCHITECTURE.md)
- [Database schema](docs/DATABASE_SCHEMA.md)
- [Ingestion architecture](docs/INGESTION_ARCHITECTURE.md)
- [RAG architecture](docs/RAG_ARCHITECTURE.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [API reference](docs/API.md)

## Tests

```bash
make test    # backend pytest suite (real Postgres test DB) + frontend type-check and lint
```
