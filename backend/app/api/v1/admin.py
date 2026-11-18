from datetime import datetime

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import RequestContext, request_context, require
from app.core.errors import NotFound
from app.core.rbac import Permission
from app.db.session import get_db
from app.models import AppSetting, AuditLog, User
from app.services import audit
from app.services.app_settings import SETTINGS_MODELS, get_all, get_setting, provider_status, put_setting

router = APIRouter(tags=["administration"])
can_settings = require(Permission.settings_manage)


@router.get("/settings")
def read_settings(db: Session = Depends(get_db), _: User = Depends(can_settings)):
    meta = {r.key: {"updated_at": r.updated_at, "updated_by": r.updated_by}
            for r in db.scalars(select(AppSetting)).all()}
    return {"values": get_all(db), "meta": meta}


@router.put("/settings/{key}")
def write_setting(key: str, value: dict = Body(...), db: Session = Depends(get_db),
                  actor: User = Depends(can_settings), ctx: RequestContext = Depends(request_context)):
    if key not in SETTINGS_MODELS:
        raise NotFound(f"Unknown settings key '{key}'.")
    before = get_setting(db, key).model_dump()
    validated = put_setting(db, key, value, actor.id)  # raises ValidationError → 422
    after = validated.model_dump()
    audit.record(db, actor=actor, action="settings.update", resource_type="settings", resource_id=key, ctx=ctx,
                 details={"changed": {k: {"from": before.get(k), "to": v} for k, v in after.items()
                                      if before.get(k) != v}})
    db.commit()
    return {"key": key, "value": after}


@router.get("/settings/providers/status")
def providers(_: User = Depends(can_settings)):
    return provider_status()


@router.get("/audit-logs")
def audit_logs(action: str | None = Query(None, max_length=80), actor: str | None = Query(None, max_length=320),
               resource_type: str | None = Query(None, max_length=60), since: datetime | None = None,
               until: datetime | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
               db: Session = Depends(get_db), _: User = Depends(require(Permission.audit_read))):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"{action}%"))
    if actor:
        stmt = stmt.where(AuditLog.actor_email.ilike(f"%{actor}%"))
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if since:
        stmt = stmt.where(AuditLog.created_at >= since)
    if until:
        stmt = stmt.where(AuditLog.created_at <= until)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).all()
    actions = db.scalars(select(AuditLog.action).distinct().order_by(AuditLog.action)).all()
    return {"items": [{"id": r.id, "actor_email": r.actor_email, "action": r.action,
                       "resource_type": r.resource_type, "resource_id": r.resource_id, "details": r.details,
                       "ip": str(r.ip) if r.ip else None, "created_at": r.created_at} for r in rows],
            "total": total, "limit": limit, "offset": offset, "actions": actions}
