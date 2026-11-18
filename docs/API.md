# API reference

The machine-readable contract is OpenAPI: `GET /api/openapi.json`. Interactive docs are at `/api/docs` (Swagger) and `/api/redoc`.

## Conventions
- Base path `/api/v1`. JSON in and out.
- **Auth**: `POST /auth/login` sets an `HttpOnly` session cookie. Cookie-authenticated `POST/PUT/PATCH/DELETE` requests must
  send `X-Requested-With: eletsgpt` (CSRF defence). API clients can send `Authorization: Bearer <jwt>` instead.
- **Errors**: `{"error": {"code": "...", "message": "...", "details": ..., "request_id": "..."}}`. Common codes:
  `unauthorized` (401), `forbidden`/`csrf_failed` (403), `not_found` (404), `conflict` (409), `validation_error` (422),
  `rate_limited` (429), `engine_not_ready` (503: the feature ships in a later phase; `details.phase` says which).
- **Pagination**: `limit` + `offset`; responses are `{items, total, limit, offset}`.

## Endpoints
| Area | Method & path | Permission |
|---|---|---|
| System | `GET /health`, `GET /health/ready` | public |
| | `GET /system/capabilities` | signed in |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | — / signed in |
| Users | `GET/POST /users`, `PATCH /users/{id}`, `POST /users/{id}/reset-password`, `GET /roles` | `users:manage` |
| Sources | `GET /sources`, `GET /sources/{id}` | `knowledge:read` |
| | `POST /sources`, `PATCH/DELETE /sources/{id}`, `POST /sources/{id}/jobs` | `sources:manage` |
| Jobs & logs | `GET /jobs`, `GET /jobs/{id}`, `GET /ingestion/logs` | `knowledge:read` |
| Documents | `GET /documents` (FTS `q`, filters, sort), `GET /documents/facets`, `GET /documents/{id}`, `GET /documents/{id}/chunks`, `GET /entities`, `GET /knowledge/index-health` | `knowledge:read` (access-level filtered) |
| | `PATCH /documents/{id}`, `POST /documents/{id}/reprocess` | `knowledge:manage` |
| Workspace | `GET/POST /conversations`, `GET/PATCH/DELETE /conversations/{id}`, `POST /conversations/{id}/messages` (SSE), `POST …/messages/{mid}/feedback` | `chat:use` (owner only) |
| Inspector | `GET /retrieval/pipeline`, `POST /retrieval/inspect`, `GET /retrieval/traces`, `GET /retrieval/traces/{id}` | `inspector:use` |
| Analytics | `GET /analytics/overview?days=`, `GET /eval/datasets`, `GET /eval/runs` | `analytics:read` |
| | `POST /eval/runs` | `eval:manage` |
| Admin | `GET /settings`, `PUT /settings/{llm\|embedding\|reranker\|retrieval\|usage_limits}`, `GET /settings/providers/status` | `settings:manage` |
| | `GET /audit-logs` | `audit:read` |

## Streaming answers (SSE)
`POST /conversations/{id}/messages` with `{"content": "...", "filters": {...}}` returns `text/event-stream`:

| event | data |
|---|---|
| `user_message` | `{message}`: the saved user turn |
| `assistant_message` | `{message}`: the assistant turn is created (status `streaming`) |
| `stage` | `{stage, status, detail?}`: progress through classify / retrieve / rerank / generate / verify |
| `token` | `{delta}`: answer text |
| `citations` | `{citations: [{index, document_id, chunk_id, title, url, published_at, excerpt, page_number?, timestamp_start?, verified}]}` |
| `related` | `{questions: [...]}` |
| `error` | `{code, message, details?}` |
| `done` | `{message}`: the final saved assistant message |

Citation URLs always come from `documents` rows, never from model output.
