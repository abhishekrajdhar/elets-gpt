from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.ratelimit import get_rate_limiter
from app.db.session import get_db
from app.models import User
from app.services.capabilities import capabilities

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    checks = {}
    try:
        db.execute(text("SELECT 1"))
        ext = db.execute(text("SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm')")).scalars()
        checks["database"] = "ok"
        checks["extensions"] = sorted(ext)
    except Exception as exc:  # noqa: BLE001
        checks["database"] = f"error: {type(exc).__name__}"
    checks["redis"] = "ok" if get_rate_limiter().ping() else "unavailable (in-process rate limiting)"
    ok = checks["database"] == "ok"
    return JSONResponse({"status": "ok" if ok else "degraded", "checks": checks}, status_code=200 if ok else 503)


@router.get("/system/capabilities")
def system_capabilities(_: User = Depends(get_current_user)):
    return capabilities()
