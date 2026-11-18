.PHONY: up down migrate admin backend frontend test lint seed-sample purge-sample build

up:            ## Start Postgres (pgvector) and Redis
	docker compose up -d db redis

down:
	docker compose down

migrate:
	cd backend && uv run alembic upgrade head

admin:         ## Create the first admin from BOOTSTRAP_ADMIN_* in backend/.env
	cd backend && uv run python -m app.cli create-admin --from-env

backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest
	cd frontend && npx tsc --noEmit && npx eslint src

lint:
	cd backend && uv run ruff check app tests

seed-sample:   ## Load clearly-labelled FICTIONAL sample documents for UI review
	cd backend && uv run python -m app.cli seed-sample

purge-sample:
	cd backend && uv run python -m app.cli purge-sample

build:         ## Build and run the full stack in Docker
	docker compose --profile app up -d --build
