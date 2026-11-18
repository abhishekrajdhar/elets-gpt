import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import RequestContext, request_context, require
from app.core.config import get_settings
from app.core.errors import Conflict, EngineNotReady, NotFound
from app.core.rbac import Permission
from app.db.session import get_db
from app.models import CrawlUrl, Document, IngestionJob, IngestionLog, Source, User
from app.models.enums import CrawlStatus, DocStatus, JobStatus, LogLevel, SourceType
from app.schemas.common import Page
from app.schemas.sources import JobBrief, JobCreate, JobOut, LogOut, SourceCreate, SourceOut, SourceUpdate
from app.services import audit
from app.services.app_settings import PROVIDER_ENV
from app.services.capabilities import is_enabled

router = APIRouter(tags=["knowledge-acquisition"])
can_read = require(Permission.knowledge_read)
can_manage = require(Permission.sources_manage)


def _credentials(source: Source) -> tuple[list[str], bool]:
    if source.source_type == SourceType.youtube_channel:
        envs = PROVIDER_ENV["youtube"]
        s = get_settings()
        return [e for e, _ in envs], all(getattr(s, a) for _, a in envs)
    return [], True


def _source_out(db: Session, source: Source, doc_counts: dict | None = None,
                failed_counts: dict | None = None) -> SourceOut:
    out = SourceOut.model_validate(source)
    if doc_counts is None:
        out.document_count = db.scalar(select(func.count()).where(
            Document.source_id == source.id, Document.status == DocStatus.active)) or 0
    else:
        out.document_count = doc_counts.get(source.id, 0)
    if failed_counts is None:
        out.failed_url_count = db.scalar(select(func.count()).where(
            CrawlUrl.source_id == source.id, CrawlUrl.status == CrawlStatus.failed)) or 0
    else:
        out.failed_url_count = failed_counts.get(source.id, 0)
    job = db.scalar(select(IngestionJob).where(IngestionJob.source_id == source.id)
                    .order_by(IngestionJob.created_at.desc()).limit(1))
    out.latest_job = JobBrief.model_validate(job) if job else None
    out.requires_credentials, out.credentials_configured = _credentials(source)
    return out


@router.get("/sources", response_model=list[SourceOut])
def list_sources(db: Session = Depends(get_db), _: User = Depends(can_read)):
    sources = db.scalars(select(Source).order_by(Source.created_at, Source.name)).all()
    doc_counts = dict(db.execute(select(Document.source_id, func.count())
                                 .where(Document.status == DocStatus.active)
                                 .group_by(Document.source_id)).all())
    failed = dict(db.execute(select(CrawlUrl.source_id, func.count())
                             .where(CrawlUrl.status == CrawlStatus.failed).group_by(CrawlUrl.source_id)).all())
    return [_source_out(db, s, doc_counts, failed) for s in sources]


@router.get("/sources/{source_id}", response_model=SourceOut)
def get_source(source_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(can_read)):
    source = db.get(Source, source_id)
    if not source:
        raise NotFound("Source not found.")
    return _source_out(db, source)


@router.post("/sources", response_model=SourceOut, status_code=201)
def create_source(body: SourceCreate, db: Session = Depends(get_db), actor: User = Depends(can_manage),
                  ctx: RequestContext = Depends(request_context)):
    if db.scalar(select(Source.id).where(Source.slug == body.slug)):
        raise Conflict("A source with this slug already exists.")
    data = body.model_dump()
    data["crawl_config"] = body.crawl_config.model_dump(exclude_none=True)
    source = Source(**data, created_by=actor.id)
    db.add(source)
    db.flush()
    audit.record(db, actor=actor, action="source.create", resource_type="source", resource_id=source.id,
                 ctx=ctx, details={"slug": source.slug, "base_url": source.base_url})
    db.commit()
    return _source_out(db, source)


@router.patch("/sources/{source_id}", response_model=SourceOut)
def update_source(source_id: uuid.UUID, body: SourceUpdate, db: Session = Depends(get_db),
                  actor: User = Depends(can_manage), ctx: RequestContext = Depends(request_context)):
    source = db.get(Source, source_id)
    if not source:
        raise NotFound("Source not found.")
    changes = body.model_dump(exclude_unset=True)
    if "crawl_config" in changes and body.crawl_config is not None:
        changes["crawl_config"] = body.crawl_config.model_dump(exclude_none=True)
    before = {k: getattr(source, k) for k in changes}
    for k, v in changes.items():
        setattr(source, k, v)
    audit.record(db, actor=actor, action="source.update", resource_type="source", resource_id=source.id,
                 ctx=ctx, details={"before": before, "after": changes})
    db.commit()
    db.refresh(source)
    return _source_out(db, source)


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: uuid.UUID, db: Session = Depends(get_db), actor: User = Depends(can_manage),
                  ctx: RequestContext = Depends(request_context)):
    source = db.get(Source, source_id)
    if not source:
        raise NotFound("Source not found.")
    docs = db.scalar(select(func.count()).where(Document.source_id == source.id)) or 0
    if docs:
        raise Conflict(f"This source has {docs} indexed documents. Disable it instead of deleting it, so "
                       "provenance is preserved.", details={"document_count": docs})
    audit.record(db, actor=actor, action="source.delete", resource_type="source", resource_id=source.id,
                 ctx=ctx, details={"slug": source.slug})
    db.delete(source)
    db.commit()


@router.post("/sources/{source_id}/jobs", response_model=JobOut, status_code=202)
def trigger_job(source_id: uuid.UUID, body: JobCreate, db: Session = Depends(get_db),
                _: User = Depends(can_manage)):
    if not db.get(Source, source_id):
        raise NotFound("Source not found.")
    # Refuse rather than create a queued job that no worker will ever pick up. Phase 2 replaces this
    # with: create IngestionJob(queued) -> enqueue Celery task -> return the job.
    if not is_enabled("ingestion_worker"):
        raise EngineNotReady("The ingestion worker", 2)
    raise EngineNotReady("The ingestion worker", 2)


@router.get("/jobs", response_model=Page[JobOut])
def list_jobs(source_id: uuid.UUID | None = None, status: JobStatus | None = None,
              limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
              db: Session = Depends(get_db), _: User = Depends(can_read)):
    stmt = select(IngestionJob, Source.name).join(Source, Source.id == IngestionJob.source_id)
    if source_id:
        stmt = stmt.where(IngestionJob.source_id == source_id)
    if status:
        stmt = stmt.where(IngestionJob.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(IngestionJob.created_at.desc()).limit(limit).offset(offset)).all()
    items = []
    for job, name in rows:
        o = JobOut.model_validate(job)
        o.source_name = name
        items.append(o)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(can_read)):
    job = db.get(IngestionJob, job_id)
    if not job:
        raise NotFound("Job not found.")
    o = JobOut.model_validate(job)
    o.source_name = db.scalar(select(Source.name).where(Source.id == job.source_id))
    return o


@router.get("/ingestion/logs", response_model=Page[LogOut])
def list_logs(job_id: uuid.UUID | None = None, level: LogLevel | None = None,
              limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
              db: Session = Depends(get_db), _: User = Depends(can_read)):
    stmt = select(IngestionLog)
    if job_id:
        stmt = stmt.where(IngestionLog.job_id == job_id)
    if level:
        stmt = stmt.where(IngestionLog.level == level)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(IngestionLog.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[LogOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)
