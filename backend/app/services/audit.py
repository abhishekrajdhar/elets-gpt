import logging
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.api.deps import RequestContext
from app.models import AuditLog, User

log = logging.getLogger("audit")


def record(db: Session, *, actor: User | None, action: str, resource_type: str | None = None,
           resource_id: Any = None, details: dict | None = None, ctx: RequestContext | None = None,
           actor_email: str | None = None) -> None:
    """Append an audit entry to the current transaction (committed with the caller's change)."""
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else actor_email,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=jsonable_encoder(details or {}),
        ip=ctx.ip if ctx else None,
        user_agent=ctx.user_agent if ctx else None,
    )
    db.add(entry)
    log.info("audit", extra={"action": action, "resource_type": resource_type,
                             "resource_id": entry.resource_id, "actor": entry.actor_email})
