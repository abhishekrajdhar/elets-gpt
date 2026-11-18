import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import RequestContext, request_context, require
from app.core.errors import Conflict, NotFound
from app.core.rbac import ROLE_DESCRIPTIONS, ROLE_MAX_ACCESS, ROLE_PERMISSIONS, Permission, Role
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User
from app.schemas.common import Page
from app.schemas.users import PasswordReset, UserCreate, UserOut, UserUpdate
from app.services import audit

router = APIRouter(tags=["users"])
admin_only = require(Permission.users_manage)


@router.get("/users", response_model=Page[UserOut])
def list_users(q: str | None = Query(None, max_length=200), role: Role | None = None,
               active: bool | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
               db: Session = Depends(get_db), _: User = Depends(admin_only)):
    stmt = select(User)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(like), func.lower(User.full_name).like(like)))
    if role:
        stmt = stmt.where(User.role == role)
    if active is not None:
        stmt = stmt.where(User.is_active == active)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[UserOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), actor: User = Depends(admin_only),
                ctx: RequestContext = Depends(request_context)):
    exists = db.scalar(select(User.id).where(func.lower(User.email) == body.email.lower()))
    if exists:
        raise Conflict("A user with this email already exists.")
    user = User(email=body.email.lower(), full_name=body.full_name, role=body.role,
                password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    audit.record(db, actor=actor, action="user.create", resource_type="user", resource_id=user.id, ctx=ctx,
                 details={"email": user.email, "role": user.role.value})
    db.commit()
    return UserOut.model_validate(user)


def _active_admin_count(db: Session) -> int:
    return db.scalar(select(func.count()).where(User.role == Role.admin, User.is_active.is_(True))) or 0


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, body: UserUpdate, db: Session = Depends(get_db),
                actor: User = Depends(admin_only), ctx: RequestContext = Depends(request_context)):
    user = db.get(User, user_id)
    if not user:
        raise NotFound("User not found.")
    changes = body.model_dump(exclude_unset=True)
    if user.id == actor.id and (changes.get("is_active") is False or
                                ("role" in changes and changes["role"] != Role.admin)):
        raise Conflict("You cannot deactivate or demote your own account.")
    demoting_admin = user.role == Role.admin and (
        changes.get("is_active") is False or ("role" in changes and changes["role"] != Role.admin))
    if demoting_admin and _active_admin_count(db) <= 1:
        raise Conflict("At least one active administrator is required.")

    before = {k: getattr(user, k) for k in changes}
    for k, v in changes.items():
        setattr(user, k, v)
    if "role" in changes or changes.get("is_active") is False:
        user.token_version += 1  # force re-login with new privileges
    audit.record(db, actor=actor, action="user.update", resource_type="user", resource_id=user.id, ctx=ctx,
                 details={"before": {k: str(v) for k, v in before.items()},
                          "after": {k: str(v) for k, v in changes.items()}})
    db.commit()
    return UserOut.model_validate(user)


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_password(user_id: uuid.UUID, body: PasswordReset, db: Session = Depends(get_db),
                   actor: User = Depends(admin_only), ctx: RequestContext = Depends(request_context)):
    user = db.get(User, user_id)
    if not user:
        raise NotFound("User not found.")
    user.password_hash = hash_password(body.password)
    user.token_version += 1
    audit.record(db, actor=actor, action="user.reset_password", resource_type="user", resource_id=user.id,
                 ctx=ctx)
    db.commit()


@router.get("/roles")
def list_roles(db: Session = Depends(get_db), _: User = Depends(require(Permission.users_manage))):
    counts = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    return {
        "permissions": [p.value for p in Permission],
        "roles": [
            {"role": r.value, "description": ROLE_DESCRIPTIONS[r],
             "permissions": sorted(p.value for p in ROLE_PERMISSIONS[r]),
             "max_access_level": ROLE_MAX_ACCESS[r].value, "user_count": counts.get(r, 0)}
            for r in Role
        ],
    }
