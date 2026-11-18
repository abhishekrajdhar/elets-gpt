import json

import pytest

from app.core.rbac import Role
from app.db.session import SessionLocal
from app.services import sample_data

SOURCE = {"name": "Test Source", "slug": "test-source", "source_type": "website",
          "base_url": "https://example.test/", "vertical": "egov"}


@pytest.fixture
def sample():
    with SessionLocal() as db:
        sample_data.seed(db)


def test_seeded_registry(client, as_role):
    sources = client.get("/api/v1/sources", headers=as_role(Role.viewer)).json()
    slugs = {s["slug"] for s in sources}
    assert {"eletsonline", "elets-bfsi", "elets-egov", "elets-youtube", "elets-magazine"} <= slugs
    yt = next(s for s in sources if s["slug"] == "elets-youtube")
    assert yt["requires_credentials"] == ["YOUTUBE_API_KEY"]
    assert all(s["crawl_config"]["respect_robots"] is True for s in sources)


def test_source_crud_validation_and_audit(client, as_role):
    h = as_role(Role.knowledge_manager)
    assert client.post("/api/v1/sources", headers=as_role(Role.analyst), json=SOURCE).status_code == 403
    for bad in ({"base_url": "ftp://x"}, {"base_url": "https://user:pw@x.test"}, {"slug": "Bad Slug"},
                {"schedule_cron": "every day"}, {"crawl_config": {"respect_robots": False}}):
        assert client.post("/api/v1/sources", headers=h, json={**SOURCE, **bad}).status_code == 422, bad
    created = client.post("/api/v1/sources", headers=h, json={**SOURCE, "schedule_cron": "0 3 * * 1"})
    assert created.status_code == 201
    sid = created.json()["id"]
    assert client.post("/api/v1/sources", headers=h, json=SOURCE).status_code == 409
    upd = client.patch(f"/api/v1/sources/{sid}", headers=h, json={"enabled": False})
    assert upd.json()["enabled"] is False
    assert client.delete(f"/api/v1/sources/{sid}", headers=h).status_code == 204
    logs = client.get("/api/v1/audit-logs", headers=as_role(Role.admin), params={"action": "source."}).json()
    assert [i["action"] for i in logs["items"]] == ["source.delete", "source.update", "source.create"]


def test_trigger_job_refuses_until_worker_exists(client, as_role):
    h = as_role(Role.knowledge_manager)
    sid = client.get("/api/v1/sources", headers=h).json()[0]["id"]
    r = client.post(f"/api/v1/sources/{sid}/jobs", headers=h, json={})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "engine_not_ready"
    assert client.get("/api/v1/jobs", headers=h).json()["total"] == 0  # no phantom queued job


def test_document_search_and_access_control(client, as_role, sample):
    viewer, admin = as_role(Role.viewer), as_role(Role.admin)
    r = client.get("/api/v1/documents", headers=viewer, params={"q": "telemedicine"}).json()
    assert r["total"] == 2
    assert all(i["is_sample"] for i in r["items"])
    assert "<<" in r["items"][0]["snippet"]
    # Internal document is hidden from viewers but visible to admins.
    vt = client.get("/api/v1/documents", headers=viewer, params={"q": "core banking"}).json()["total"]
    at = client.get("/api/v1/documents", headers=admin, params={"q": "core banking"}).json()["total"]
    assert (vt, at) == (0, 1)
    bfsi = client.get("/api/v1/documents", headers=admin, params={"vertical": "bfsi"}).json()
    assert {i["vertical"] for i in bfsi["items"]} == {"bfsi"} and bfsi["total"] == 2


def test_document_detail_chunks_entities(client, as_role, sample):
    h = as_role(Role.analyst)
    doc = client.get("/api/v1/documents", headers=h, params={"doc_type": "video"}).json()["items"][0]
    detail = client.get(f"/api/v1/documents/{doc['id']}", headers=h).json()
    assert detail["video_id"] == "SAMPLEVID01" and detail["chunk_count"] == 3
    assert any(e["role"] == "speaker" for e in detail["entities"])
    chunks = client.get(f"/api/v1/documents/{doc['id']}/chunks", headers=h).json()
    assert chunks["items"][1]["timestamp_start"] == 420.0


def test_facets_and_entities(client, as_role, sample):
    h = as_role(Role.viewer)
    f = client.get("/api/v1/documents/facets", headers=h).json()
    assert f["total"] == 7  # internal sample doc excluded for viewers
    orgs = client.get("/api/v1/entities", headers=h, params={"entity_type": "organisation"}).json()
    sample_bank = next(o for o in orgs if o["name"] == "Sample Bank Ltd")
    assert sample_bank["document_count"] == 2  # internal briefing not counted for viewers
    filtered = client.get("/api/v1/documents", headers=h, params={"entity_id": sample_bank["id"]}).json()
    assert filtered["total"] == 2


def test_soft_delete_hides_document_and_is_audited(client, as_role, sample):
    km, viewer = as_role(Role.knowledge_manager), as_role(Role.viewer)
    doc = client.get("/api/v1/documents", headers=km, params={"q": "fraud"}).json()["items"][0]
    assert client.patch(f"/api/v1/documents/{doc['id']}", headers=viewer, json={"status": "deleted"}).status_code == 403
    assert client.patch(f"/api/v1/documents/{doc['id']}", headers=km, json={"status": "deleted"}).status_code == 200
    assert client.get("/api/v1/documents", headers=viewer, params={"q": "fraud"}).json()["total"] == 0
    assert client.get(f"/api/v1/documents/{doc['id']}", headers=viewer).status_code == 404
    health = client.get("/api/v1/knowledge/index-health", headers=km).json()
    assert health["documents"]["by_status"]["deleted"] == 1


def test_index_health_counts(client, as_role, sample):
    health = client.get("/api/v1/knowledge/index-health", headers=as_role(Role.analyst)).json()
    assert health["documents"]["active"] == 8 and health["documents"]["sample"] == 8
    assert health["chunks"]["active"] > 0 and health["embeddings"] == []


def test_purge_sample(client, as_role, sample):
    with SessionLocal() as db:
        assert sample_data.purge(db) == 8
    assert client.get("/api/v1/documents", headers=as_role(Role.admin)).json()["total"] == 0


def _events(raw: str) -> list[tuple[str, dict]]:
    out = []
    for block in raw.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_conversation_stream_reports_engine_not_ready(client, make_user):
    from tests.conftest import bearer
    u, other = make_user(Role.viewer), make_user(Role.viewer)
    h = bearer(u)
    conv = client.post("/api/v1/conversations", headers=h, json={"filters": {"verticals": ["egov"]}}).json()
    r = client.post(f"/api/v1/conversations/{conv['id']}/messages", headers=h,
                    json={"content": "What did Elets publish about citizen portals?"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = _events(r.text)
    assert [e for e, _ in events] == ["user_message", "error", "done"]
    assert events[1][1]["code"] == "engine_not_ready"
    detail = client.get(f"/api/v1/conversations/{conv['id']}", headers=h).json()
    assert detail["title"].startswith("What did Elets publish")
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["error_code"] == "engine_not_ready"
    # Conversations are private to their owner.
    assert client.get(f"/api/v1/conversations/{conv['id']}", headers=bearer(other)).status_code == 404


def test_question_length_and_filter_validation(client, as_role):
    h = as_role(Role.viewer)
    conv = client.post("/api/v1/conversations", headers=h, json={}).json()
    assert client.post(f"/api/v1/conversations/{conv['id']}/messages", headers=h,
                       json={"content": "x" * 5000}).status_code == 422
    assert client.post("/api/v1/conversations", headers=h, json={
        "filters": {"date_from": "2026-05-01", "date_to": "2026-01-01"}}).status_code == 422


def test_inspector_and_eval_permissions(client, as_role):
    assert client.post("/api/v1/retrieval/inspect", headers=as_role(Role.viewer),
                       json={"query": "x"}).status_code == 403
    r = client.post("/api/v1/retrieval/inspect", headers=as_role(Role.analyst), json={"query": "x"})
    assert r.status_code == 503 and r.json()["error"]["details"]["phase"] == 3
    pipe = client.get("/api/v1/retrieval/pipeline", headers=as_role(Role.analyst)).json()
    assert pipe["config"]["retrieval"]["rrf_k"] == 60


def test_analytics_overview_reflects_real_data(client, as_role, sample):
    data = client.get("/api/v1/analytics/overview", headers=as_role(Role.analyst)).json()
    assert data["corpus"]["documents"] == 8 and data["corpus"]["sample_documents"] == 8
    assert data["usage"]["events"] == 0
    assert data["usage"]["answer_latency_ms"]["p95"] is None  # no fabricated numbers
    assert client.get("/api/v1/analytics/overview", headers=as_role(Role.viewer)).status_code == 403
