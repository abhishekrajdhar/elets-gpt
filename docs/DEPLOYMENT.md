# Production deployment

## Topology
```
Internet → TLS load balancer / reverse proxy
            ├── frontend (Next.js standalone, :3000)  ── /api/* rewrite ──► backend (FastAPI, :8000)
            └── (optional) direct /api/* → backend
backend ─► managed PostgreSQL 17 + pgvector  (RDS / Cloud SQL / Azure Flexible Server / Neon / Supabase)
backend ─► managed Redis                      (ElastiCache / Memorystore / Upstash)
worker  ─► same Postgres + Redis               (Phase 2: Celery workers + beat)
```
Run the frontend and backend as stateless containers (ECS/Fargate, Cloud Run, Azure Container Apps, Fly.io,
or Kubernetes). Start with 2 replicas of each behind the load balancer.

## Required settings (backend)
| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production` (the app refuses to start if `COOKIE_SECURE` is false) |
| `DATABASE_URL` | managed Postgres URL, with `sslmode=require` |
| `REDIS_URL` | managed Redis URL (`rediss://` for TLS) |
| `JWT_SECRET` | ≥ 48 random characters, from a secrets manager |
| `COOKIE_SECURE` | `true` |
| Provider keys | only those in use; injected from a secrets manager (AWS Secrets Manager, GCP Secret Manager, Vault) |

The frontend needs `BACKEND_URL` at **build time**, because standalone output bakes in the rewrites
(`docker build --build-arg BACKEND_URL=https://api.internal:8000`).

## Database
- Enable the `vector`, `pg_trgm` and `unaccent` extensions. Migration `0001` does this when the role is allowed to.
- Migrations run on backend container start (`alembic upgrade head`) and are idempotent. For zero-downtime
  releases, run migrations as a one-off job before rolling out the new image.
- Size the instance for the corpus: about 500k chunks × 1024-dim vectors is roughly 2 GB of vectors plus an HNSW index of
  similar size. 4 vCPU / 16 GB RAM is a comfortable start.

## Backups and recovery
- Enable managed point-in-time recovery (WAL archiving) with ≥ 14 days of retention.
- Take a daily logical backup as well: `pg_dump -Fc --no-owner "$DATABASE_URL" > eletsgpt-$(date +%F).dump`, stored in
  versioned object storage with lifecycle rules.
- Restore: `pg_restore --clean --if-exists --no-owner -d "$TARGET_URL" eletsgpt-YYYY-MM-DD.dump`, then
  `alembic upgrade head`.
- Run a restore drill monthly into a scratch database, and check row counts for `documents`, `chunks` and `audit_logs`.
- Reindexing never deletes documents (new versions and soft deletes only), so a corpus can be rebuilt from Postgres alone.

## Security checklist
- [ ] HTTPS everywhere; HSTS is sent by the backend in staging/production.
- [ ] `COOKIE_SECURE=true`. Session cookies are `HttpOnly` and `SameSite=Lax`; mutating requests need the CSRF header.
- [ ] Rotate the first admin's password after bootstrap, and remove `BOOTSTRAP_ADMIN_*` from the environment.
- [ ] Restrict network access so Postgres and Redis are reachable only from the app subnet.
- [ ] Ship logs (JSON on stdout) to your log platform; alert on `level=ERROR` and 5xx rates.
- [ ] Back up `audit_logs` together with the database; no API can modify them.
- [ ] Phase 4: create the read-only `eletsgpt_analytics_ro` role for the SQL lane (see `DATABASE_SCHEMA.md`).

## Observability
- Each request is logged as structured JSON with `request_id`, path, status and latency. The request ID is echoed
  back in `X-Request-ID` and in every error envelope.
- Liveness: `GET /api/v1/health`. Readiness (DB + extensions + Redis): `GET /api/v1/health/ready`.
- OpenTelemetry tracing is added in Phase 7. The middleware is the integration point.
