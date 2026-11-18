# Local setup

## Prerequisites
- Docker (for Postgres + pgvector and Redis)
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js 22 and npm

## 1. Configuration
```bash
cp .env.example .env
cp backend/.env.example backend/.env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET
```
Put the same Postgres password into `.env` (`POSTGRES_PASSWORD`) and into both URLs in `backend/.env`. Set
`BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`: at least 12 characters, mixing three of lowercase,
uppercase, digits and symbols.

## 2. Databases
```bash
docker compose up -d db redis
```
On first start, `infra/postgres/init/01-extensions.sql` enables `vector`, `pg_trgm` and `unaccent`, and creates the
`eletsgpt_test` database.

## 3. Backend
```bash
cd backend
uv sync
uv run alembic upgrade head                       # schema + seeded source registry
uv run python -m app.cli create-admin --from-env  # or: create-admin --email you@x.com (prompts for password)
uv run uvicorn app.main:app --reload --port 8000
```
- Swagger UI: http://localhost:8000/api/docs
- Readiness: http://localhost:8000/api/v1/health/ready

## 4. Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:3000. /api/* is proxied to BACKEND_URL (default http://localhost:8000)
```

## 5. Optional sample data
```bash
cd backend && uv run python -m app.cli seed-sample     # 8 fictional documents, flagged is_sample
uv run python -m app.cli purge-sample                  # remove them
```
One sample document is `internal`, which shows permission-aware filtering: viewers can't see it, analysts can.

## 6. Tests
```bash
cd backend && uv run pytest          # runs migrations against TEST_DATABASE_URL (it is reset each run)
cd frontend && npx tsc --noEmit && npx eslint src && npm run build
```

## Full stack in Docker
```bash
docker compose --profile app up -d --build    # backend :8000, frontend :3000
docker compose exec backend uv run python -m app.cli create-admin --from-env
```
