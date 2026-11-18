"""Retrieval inspector, analytics and evaluation read APIs. Every number is computed from real tables."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.deps import require
from app.core.errors import EngineNotReady, NotFound
from app.core.rbac import Permission
from app.db.session import get_db
from app.models import (
    Chunk,
    Document,
    EvalDataset,
    EvalQuestion,
    EvalRun,
    Message,
    RetrievalTrace,
    Source,
    UsageEvent,
    User,
)
from app.models.enums import DocStatus, MessageRole, MessageStatus, UsageEventType
from app.schemas.conversations import InspectRequest
from app.services.app_settings import get_setting

router = APIRouter(tags=["insights"])
can_inspect = require(Permission.inspector_use)
can_analytics = require(Permission.analytics_read)

PIPELINE_STAGES = [
    {"key": "classify", "label": "Query classification", "phase": 4},
    {"key": "dense", "label": "Dense vector search", "phase": 3},
    {"key": "lexical", "label": "BM25 / full-text search", "phase": 3},
    {"key": "fusion", "label": "Reciprocal Rank Fusion", "phase": 3},
    {"key": "rerank", "label": "Cross-encoder reranking", "phase": 3},
    {"key": "evidence", "label": "Evidence selection", "phase": 3},
    {"key": "citations", "label": "Citation verification", "phase": 4},
]


@router.get("/retrieval/pipeline")
def pipeline(db: Session = Depends(get_db), _: User = Depends(can_inspect)):
    return {
        "stages": PIPELINE_STAGES,
        "config": {
            "retrieval": get_setting(db, "retrieval").model_dump(),
            "reranker": get_setting(db, "reranker").model_dump(),
            "embedding": get_setting(db, "embedding").model_dump(),
        },
    }


@router.post("/retrieval/inspect")
def inspect(body: InspectRequest, _: User = Depends(can_inspect)):
    raise EngineNotReady("The retrieval engine", 3)


@router.get("/retrieval/traces")
def list_traces(limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
                db: Session = Depends(get_db), _: User = Depends(can_inspect)):
    total = db.scalar(select(func.count()).select_from(RetrievalTrace)) or 0
    rows = db.scalars(select(RetrievalTrace).order_by(RetrievalTrace.created_at.desc())
                      .limit(limit).offset(offset)).all()
    return {"items": [{"id": t.id, "query": t.query, "query_type": t.query_type,
                       "total_latency_ms": t.total_latency_ms, "evidence_count": len(t.final_evidence or []),
                       "created_at": t.created_at} for t in rows],
            "total": total, "limit": limit, "offset": offset}


@router.get("/retrieval/traces/{trace_id}")
def get_trace(trace_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(can_inspect)):
    t = db.get(RetrievalTrace, trace_id)
    if not t:
        raise NotFound("Trace not found.")
    return {c.name: getattr(t, c.name) for c in RetrievalTrace.__table__.columns}


def _pct(db: Session, col, q: float, since, event_type=None):
    stmt = select(func.percentile_cont(q).within_group(col)).where(UsageEvent.created_at >= since,
                                                                    col.is_not(None))
    if event_type:
        stmt = stmt.where(UsageEvent.event_type == event_type)
    v = db.scalar(stmt)
    return round(float(v), 1) if v is not None else None


@router.get("/analytics/overview")
def analytics_overview(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db),
                       _: User = Depends(can_analytics)):
    since = datetime.now(UTC) - timedelta(days=days)
    active = Document.status == DocStatus.active

    by_vertical = db.execute(select(Document.vertical, func.count()).where(active)
                             .group_by(Document.vertical).order_by(func.count().desc())).all()
    by_type = db.execute(select(Document.doc_type, func.count()).where(active).group_by(Document.doc_type)).all()
    month = func.date_trunc("month", Document.published_at)
    by_month = db.execute(select(month, func.count()).where(active, Document.published_at.is_not(None),
                                                            Document.published_at >= datetime.now(UTC)
                                                            - timedelta(days=730))
                          .group_by(month).order_by(month)).all()

    ue = select(
        func.count(),
        func.sum(case((UsageEvent.success.is_(False), 1), else_=0)),
        func.coalesce(func.sum(UsageEvent.prompt_tokens), 0),
        func.coalesce(func.sum(UsageEvent.completion_tokens), 0),
        func.coalesce(func.sum(UsageEvent.embedding_tokens), 0),
        func.coalesce(func.sum(UsageEvent.cost_usd), 0),
    ).where(UsageEvent.created_at >= since)
    total_events, failed, p_tok, c_tok, e_tok, cost = db.execute(ue).one()
    chat_events = db.scalar(select(func.count()).where(UsageEvent.created_at >= since,
                                                       UsageEvent.event_type == UsageEventType.chat)) or 0

    answered = db.execute(select(Message.status, func.count()).where(
        Message.role == MessageRole.assistant, Message.created_at >= since).group_by(Message.status)).all()
    answered_map = {s.value: c for s, c in answered}
    fb = db.execute(select(Message.feedback, func.count()).where(
        Message.feedback.is_not(None), Message.created_at >= since).group_by(Message.feedback)).all()

    latest_runs = db.execute(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(20)).scalars().all()
    return {
        "period_days": days,
        "corpus": {
            "documents": sum(c for _, c in by_vertical),
            "chunks": db.scalar(select(func.count()).select_from(Chunk).where(Chunk.is_active)) or 0,
            "sources": db.scalar(select(func.count()).select_from(Source)) or 0,
            "sample_documents": db.scalar(select(func.count()).select_from(Document)
                                          .where(Document.is_sample, active)) or 0,
            "by_vertical": [{"value": v.value, "count": c} for v, c in by_vertical],
            "by_doc_type": [{"value": v.value, "count": c} for v, c in by_type],
            "by_month": [{"month": m.date().isoformat(), "count": c} for m, c in by_month],
        },
        "usage": {
            "events": total_events or 0,
            "chat_requests": chat_events,
            "failed": int(failed or 0),
            "prompt_tokens": int(p_tok), "completion_tokens": int(c_tok), "embedding_tokens": int(e_tok),
            "cost_usd": float(cost),
            "answer_latency_ms": {"p50": _pct(db, UsageEvent.latency_ms, 0.5, since, UsageEventType.chat),
                                  "p95": _pct(db, UsageEvent.latency_ms, 0.95, since, UsageEventType.chat)},
            "retrieval_latency_ms": {"p50": _pct(db, UsageEvent.retrieval_latency_ms, 0.5, since),
                                     "p95": _pct(db, UsageEvent.retrieval_latency_ms, 0.95, since)},
            "assistant_messages": answered_map,
            "abstained": answered_map.get(MessageStatus.abstained.value, 0),
            "feedback": {"positive": dict(fb).get(1, 0), "negative": dict(fb).get(-1, 0)},
        },
        "evaluation": {
            "runs": [{"id": r.id, "name": r.name, "strategy": r.strategy, "status": r.status,
                      "metrics": r.metrics, "created_at": r.created_at} for r in latest_runs],
        },
    }


@router.get("/eval/datasets")
def list_datasets(db: Session = Depends(get_db), _: User = Depends(can_analytics)):
    datasets = db.scalars(select(EvalDataset).order_by(EvalDataset.created_at.desc())).all()
    out = []
    for d in datasets:
        cats = db.execute(select(EvalQuestion.category, EvalQuestion.review_status, func.count())
                          .where(EvalQuestion.dataset_id == d.id)
                          .group_by(EvalQuestion.category, EvalQuestion.review_status)).all()
        out.append({"id": d.id, "name": d.name, "description": d.description, "version": d.version,
                    "created_at": d.created_at,
                    "questions": [{"category": c.value, "review_status": r.value, "count": n} for c, r, n in cats]})
    return out


@router.get("/eval/runs")
def list_runs(db: Session = Depends(get_db), _: User = Depends(can_analytics)):
    runs = db.scalars(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(100)).all()
    return [{"id": r.id, "dataset_id": r.dataset_id, "name": r.name, "strategy": r.strategy, "status": r.status,
             "metrics": r.metrics, "started_at": r.started_at, "finished_at": r.finished_at,
             "created_at": r.created_at} for r in runs]


@router.post("/eval/runs", status_code=202)
def start_run(_: User = Depends(require(Permission.eval_manage))):
    raise EngineNotReady("Evaluation runs", 6)
