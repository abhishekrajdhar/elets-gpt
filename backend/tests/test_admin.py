import pytest

from app.core.rbac import Role
from tests.conftest import bearer


@pytest.mark.parametrize("role,expected", [(Role.viewer, 403), (Role.analyst, 403),
                                           (Role.knowledge_manager, 403), (Role.admin, 200)])
def test_user_admin_is_admin_only(client, as_role, role, expected):
    assert client.get("/api/v1/users", headers=as_role(role)).status_code == expected


def test_create_user_validates_password_and_duplicates(client, as_role):
    h = as_role(Role.admin)
    weak = client.post("/api/v1/users", headers=h, json={"email": "a@example.com", "full_name": "A",
                                                          "role": "viewer", "password": "short"})
    assert weak.status_code == 422
    ok = client.post("/api/v1/users", headers=h, json={"email": "A@example.com", "full_name": "A",
                                                        "role": "analyst", "password": "Good-Password-123"})
    assert ok.status_code == 201 and ok.json()["email"] == "a@example.com"
    dup = client.post("/api/v1/users", headers=h, json={"email": "a@EXAMPLE.com", "full_name": "A",
                                                         "role": "viewer", "password": "Good-Password-123"})
    assert dup.status_code == 409


def test_admin_cannot_demote_self_and_last_admin_protected(client, make_user):
    admin = make_user(Role.admin)
    h = bearer(admin)
    r = client.patch(f"/api/v1/users/{admin.id}", headers=h, json={"role": "viewer"})
    assert r.status_code == 409


def test_role_change_revokes_sessions(client, make_user):
    admin = make_user(Role.admin)
    target = make_user(Role.analyst)
    old = bearer(target)
    assert client.patch(f"/api/v1/users/{target.id}", headers=bearer(admin),
                        json={"role": "viewer"}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=old).status_code == 401


def test_roles_matrix(client, as_role):
    data = client.get("/api/v1/roles", headers=as_role(Role.admin)).json()
    roles = {r["role"]: r for r in data["roles"]}
    assert roles["viewer"]["max_access_level"] == "public"
    assert "settings:manage" in roles["admin"]["permissions"]
    assert "settings:manage" not in roles["knowledge_manager"]["permissions"]


def test_settings_defaults_validation_and_audit(client, as_role):
    h = as_role(Role.admin)
    values = client.get("/api/v1/settings", headers=h).json()["values"]
    assert values["retrieval"]["rrf_k"] == 60
    new = {**values["retrieval"], "rrf_k": 30, "final_context_k": 6}
    r = client.put("/api/v1/settings/retrieval", headers=h, json=new)
    assert r.status_code == 200 and r.json()["value"]["rrf_k"] == 30
    bad = client.put("/api/v1/settings/retrieval", headers=h, json={**new, "rrf_k": -1})
    assert bad.status_code == 422
    assert client.put("/api/v1/settings/nope", headers=h, json={}).status_code == 404
    logs = client.get("/api/v1/audit-logs", headers=h, params={"action": "settings.update"}).json()
    assert logs["total"] == 1
    assert logs["items"][0]["details"]["changed"]["rrf_k"] == {"from": 60, "to": 30}


def test_settings_forbidden_for_non_admin(client, as_role):
    assert client.get("/api/v1/settings", headers=as_role(Role.knowledge_manager)).status_code == 403


def test_provider_status_never_exposes_secrets(client, as_role):
    data = client.get("/api/v1/settings/providers/status", headers=as_role(Role.admin)).json()
    anthropic = next(p for p in data if p["provider"] == "anthropic")
    assert set(anthropic) == {"provider", "env_vars", "configured", "missing", "requires_credentials"}
    assert anthropic["env_vars"] == ["ANTHROPIC_API_KEY"]


def test_capabilities_report_unbuilt_engines(client, as_role):
    feats = client.get("/api/v1/system/capabilities", headers=as_role(Role.viewer)).json()["features"]
    assert feats["auth"]["enabled"] is True
    assert feats["chat_answers"]["enabled"] is False and feats["chat_answers"]["phase"] == 4
