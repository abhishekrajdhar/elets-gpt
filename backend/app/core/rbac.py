"""Role-based access control. Permissions live in code so changes are reviewed in git."""

from enum import StrEnum


class Role(StrEnum):
    admin = "admin"
    knowledge_manager = "knowledge_manager"
    analyst = "analyst"
    viewer = "viewer"


class AccessLevel(StrEnum):
    public = "public"
    internal = "internal"
    restricted = "restricted"


ACCESS_ORDER = [AccessLevel.public, AccessLevel.internal, AccessLevel.restricted]


class Permission(StrEnum):
    chat_use = "chat:use"
    knowledge_read = "knowledge:read"
    inspector_use = "inspector:use"
    analytics_read = "analytics:read"
    eval_manage = "eval:manage"
    knowledge_manage = "knowledge:manage"
    sources_manage = "sources:manage"
    settings_manage = "settings:manage"
    users_manage = "users:manage"
    audit_read = "audit:read"


_BASE = {Permission.chat_use, Permission.knowledge_read}
_ANALYST = _BASE | {Permission.inspector_use, Permission.analytics_read}
_KM = _ANALYST | {Permission.eval_manage, Permission.knowledge_manage, Permission.sources_manage}

ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.viewer: frozenset(_BASE),
    Role.analyst: frozenset(_ANALYST),
    Role.knowledge_manager: frozenset(_KM),
    Role.admin: frozenset(Permission),
}

ROLE_MAX_ACCESS: dict[Role, AccessLevel] = {
    Role.viewer: AccessLevel.public,
    Role.analyst: AccessLevel.internal,
    Role.knowledge_manager: AccessLevel.restricted,
    Role.admin: AccessLevel.restricted,
}

ROLE_DESCRIPTIONS: dict[Role, str] = {
    Role.admin: "Full access, including users, settings and audit logs.",
    Role.knowledge_manager: "Manages sources, ingestion, documents and evaluation datasets.",
    Role.analyst: "Uses the assistant, explorer, retrieval inspector and analytics.",
    Role.viewer: "Uses the assistant and explorer for public content.",
}


def has_permission(role: str | Role, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS.get(Role(role), frozenset())


def allowed_access_levels(role: str | Role) -> list[str]:
    """Document access levels visible to a role, used to filter every query at request time."""
    max_level = ROLE_MAX_ACCESS[Role(role)]
    return [lvl.value for lvl in ACCESS_ORDER[: ACCESS_ORDER.index(max_level) + 1]]
