from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import RequestContext, get_current_user, request_context
from app.core.config import get_settings
from app.core.errors import Unauthorized
from app.core.ratelimit import get_rate_limiter
from app.core.rbac import ROLE_PERMISSIONS, allowed_access_levels
from app.core.security import create_access_token, hash_password, needs_rehash, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.users import LoginRequest, MeOut, PasswordChange
from app.services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


def to_me(user: User) -> MeOut:
    return MeOut(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role, is_active=user.is_active,
        last_login_at=user.last_login_at, created_at=user.created_at,
        permissions=sorted(p.value for p in ROLE_PERMISSIONS[user.role]),
        access_levels=allowed_access_levels(user.role),
    )


def _set_cookie(response: Response, token: str, expires: datetime) -> None:
    s = get_settings()
    response.set_cookie(
        s.cookie_name, token, httponly=True, secure=s.cookie_secure, samesite="lax", path="/",
        max_age=int((expires - datetime.now(UTC)).total_seconds()),
    )


@router.post("/login", response_model=MeOut)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db),
          ctx: RequestContext = Depends(request_context)):
    limiter = get_rate_limiter()
    limit = get_settings().login_rate_limit_per_minute
    limiter.hit(f"login:ip:{ctx.ip}", limit)
    limiter.hit(f"login:email:{body.email.lower()}", limit)

    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else None)
    if not user or not ok or not user.is_active:
        audit.record(db, actor=None, actor_email=body.email.lower(), action="auth.login_failed",
                     resource_type="user", resource_id=user.id if user else None, ctx=ctx,
                     details={"reason": "inactive" if (user and ok) else "invalid_credentials"})
        db.commit()
        raise Unauthorized("Invalid email or password.", code="invalid_credentials")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    user.last_login_at = datetime.now(UTC)
    audit.record(db, actor=user, action="auth.login", resource_type="user", resource_id=user.id, ctx=ctx)
    db.commit()

    token, exp = create_access_token(user.id, user.role.value, user.token_version)
    _set_cookie(response, token, exp)
    return to_me(user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(get_settings().cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return to_me(user)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChange, response: Response, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db), ctx: RequestContext = Depends(request_context)):
    if not verify_password(body.current_password, user.password_hash):
        raise Unauthorized("Current password is incorrect.", code="invalid_credentials")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    audit.record(db, actor=user, action="auth.password_changed", resource_type="user", resource_id=user.id,
                 ctx=ctx)
    db.commit()
    token, exp = create_access_token(user.id, user.role.value, user.token_version)
    _set_cookie(response, token, exp)
    response.status_code = 204
    return response
