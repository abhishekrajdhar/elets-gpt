"""Request dependencies: DB session, authenticated user, permission checks, request context."""

import ipaddress
import uuid
from collections.abc import Callable
from dataclasses import dataclass

import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import Forbidden, Unauthorized
from app.core.rbac import Permission, allowed_access_levels, has_permission
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "eletsgpt"


@dataclass
class RequestContext:
    ip: str | None
    user_agent: str | None


def request_context(request: Request) -> RequestContext:
    ip = request.client.host if request.client else None
    fwd = request.headers.get("x-forwarded-for")
    if fwd and get_settings().is_production:
        ip = fwd.split(",")[0].strip()
    try:
        ip = str(ipaddress.ip_address(ip)) if ip else None
    except ValueError:
        ip = None  # e.g. test clients or unix sockets — never store a non-IP in the inet column
    return RequestContext(ip=ip, user_agent=(request.headers.get("user-agent") or "")[:400] or None)


def _extract_token(request: Request) -> tuple[str | None, bool]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip(), False
    return request.cookies.get(get_settings().cookie_name), True


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token, from_cookie = _extract_token(request)
    if not token:
        raise Unauthorized("Authentication required.")
    try:
        claims = decode_access_token(token)
        user_id = uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise Unauthorized("Session is invalid or has expired.") from exc

    # Cookie sessions must carry the custom header on state-changing requests (CSRF defence).
    if from_cookie and request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise Forbidden("Missing CSRF header.", code="csrf_failed")

    user = db.get(User, user_id)
    if user is None or not user.is_active or user.token_version != claims.get("tv"):
        raise Unauthorized("Session is no longer valid.")
    request.state.user = user
    return user


def require(permission: Permission) -> Callable[..., User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user.role, permission):
            raise Forbidden(f"Your role does not have the '{permission.value}' permission.")
        return user

    return checker


def access_levels_for(user: User) -> list[str]:
    return allowed_access_levels(user.role)
