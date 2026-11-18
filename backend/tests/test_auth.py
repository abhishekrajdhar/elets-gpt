from app.core.rbac import Role
from tests.conftest import PASSWORD, bearer

CSRF = {"X-Requested-With": "eletsgpt"}


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    ready = client.get("/api/v1/health/ready").json()
    assert ready["checks"]["database"] == "ok"
    assert "vector" in ready["checks"]["extensions"]


def test_login_sets_httponly_cookie_and_me(client, make_user):
    u = make_user(Role.analyst)
    r = client.post("/api/v1/auth/login", json={"email": u.email.upper(), "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "analyst"
    assert "inspector:use" in body["permissions"] and "users:manage" not in body["permissions"]
    assert body["access_levels"] == ["public", "internal"]
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert client.get("/api/v1/auth/me").json()["email"] == u.email


def test_login_failures_are_generic_and_audited(client, make_user, as_role):
    u = make_user(Role.viewer)
    r = client.post("/api/v1/auth/login", json={"email": u.email, "password": "wrong-password"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"
    r2 = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert r2.json()["error"]["message"] == r.json()["error"]["message"]
    logs = client.get("/api/v1/audit-logs", params={"action": "auth.login_failed"}, headers=as_role(Role.admin))
    assert logs.json()["total"] == 2


def test_inactive_user_cannot_login(client, make_user):
    u = make_user(Role.viewer, active=False)
    assert client.post("/api/v1/auth/login", json={"email": u.email, "password": PASSWORD}).status_code == 401


def test_requires_auth(client):
    r = client.get("/api/v1/sources")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"
    assert client.get("/api/v1/sources", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_cookie_session_requires_csrf_header_for_mutations(client, make_user):
    u = make_user(Role.viewer)
    client.post("/api/v1/auth/login", json={"email": u.email, "password": PASSWORD})
    r = client.post("/api/v1/conversations", json={})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    assert client.post("/api/v1/conversations", json={}, headers=CSRF).status_code == 201


def test_bearer_token_does_not_need_csrf(client, make_user):
    u = make_user(Role.viewer)
    assert client.post("/api/v1/conversations", json={}, headers=bearer(u)).status_code == 201


def test_login_rate_limited(client, make_user):
    u = make_user(Role.viewer)
    codes = [client.post("/api/v1/auth/login", json={"email": u.email, "password": "bad"}).status_code
             for _ in range(11)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_change_password_revokes_old_sessions(client, make_user):
    u = make_user(Role.viewer)
    old = bearer(u)
    r = client.post("/api/v1/auth/change-password", headers=old,
                    json={"current_password": PASSWORD, "new_password": "Another-Password-456!"})
    assert r.status_code == 204
    assert client.get("/api/v1/auth/me", headers=old).status_code == 401
    assert client.post("/api/v1/auth/login",
                       json={"email": u.email, "password": "Another-Password-456!"}).status_code == 200


def test_logout_clears_cookie(client, make_user):
    u = make_user(Role.viewer)
    client.post("/api/v1/auth/login", json={"email": u.email, "password": PASSWORD})
    client.post("/api/v1/auth/logout")
    assert client.get("/api/v1/auth/me").status_code == 401
