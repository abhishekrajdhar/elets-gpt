from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

engine = create_engine(
    _settings.database_url,
    pool_size=_settings.db_pool_size,
    pool_pre_ping=True,
    future=True,
)


@event.listens_for(engine, "connect")
def _set_timeouts(dbapi_conn, _record):
    with dbapi_conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = {int(_settings.db_statement_timeout_ms)}")
    dbapi_conn.commit()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
