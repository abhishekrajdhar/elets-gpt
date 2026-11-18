"""Tests run against a real PostgreSQL database (TEST_DATABASE_URL), migrated with Alembic."""

import os

from app.core.config import Settings

_base = Settings()  # type: ignore[call-arg]
if not _base.test_database_url:
    raise RuntimeError("TEST_DATABASE_URL must be set to run the test-suite.")
os.environ["DATABASE_URL"] = _base.test_database_url
os.environ["ALEMBIC_DATABASE_URL"] = _base.test_database_url
os.environ["REDIS_URL"] = ""  # in-process rate limiter → deterministic tests
os.environ["ENVIRONMENT"] = "test"

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from alembic import command  # noqa: E402
from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.core.ratelimit import get_rate_limiter  # noqa: E402
from app.core.rbac import Role  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Source, User  # noqa: E402

PASSWORD = "Test-Password-123!"
_SEED_SOURCES: list[dict] = []


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    eng = create_engine(_base.test_database_url)
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    eng.dispose()
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.upgrade(cfg, "head")
    with SessionLocal() as db:
        _SEED_SOURCES[:] = [dict(r._mapping) for r in db.execute(text("SELECT * FROM sources")).all()]
    yield


@pytest.fixture(autouse=True)
def clean_db():
    yield
    with SessionLocal() as db:
        tables = db.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' "
            "AND tablename <> 'alembic_version'")).scalars().all()
        db.execute(text("TRUNCATE " + ", ".join(f'"{t}"' for t in tables) + " RESTART IDENTITY CASCADE"))
        # Restore the migration-seeded source registry.
        for row in _SEED_SOURCES:
            db.execute(Source.__table__.insert().values(**row))
        db.commit()
    get_rate_limiter().reset_local()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def make_user():
    def _make(role: Role = Role.viewer, email: str | None = None, active: bool = True) -> User:
        with SessionLocal() as db:
            n = db.execute(text("SELECT count(*) FROM users")).scalar()
            u = User(email=email or f"{role.value}{n}@example.com", full_name=f"{role.value} user",
                     role=role, password_hash=hash_password(PASSWORD), is_active=active)
            db.add(u)
            db.commit()
            db.refresh(u)
            return u
    return _make


def bearer(user: User) -> dict:
    token, _ = create_access_token(user.id, user.role.value, user.token_version)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def as_role(make_user):
    def _as(role: Role) -> dict:
        return bearer(make_user(role))
    return _as
