import uuid
from datetime import UTC, date, datetime, time
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, and_, distinct, exists, extract, func, literal, select
from sqlalchemy.orm import Session

from app.api.deps import RequestContext, access_levels_for, request_context, require
from app.core.errors import EngineNotReady, NotFound
from app.core.rbac import Permission, has_permission
from app.db.session import get_db
from app.models import (
    Chunk,
    ChunkEmbedding,
    CrawlUrl,
    Document,
    DocumentEntity,
    DocumentVersion,
    Entity,
    Source,
    User,
)
from app.models.enums import CrawlStatus, DocStatus, DocType, EntityType, Vertical
from app.schemas.common import Page
from app.schemas.documents import (
    ChunkOut,
    DocumentDetail,
    DocumentFacets,
    DocumentListItem,
    DocumentUpdate,
    EntityOut,
    EntityRef,
    FacetBucket,
)
from app.services import audit

router = APIRouter(tags=["knowledge"])
can_read = require(Permission.knowledge_read)
can_manage = require(Permission.knowledge_manage)


def _visible(stmt: Select, user: User, statuses: list[DocStatus] | None = None) -> Select:
    """Query-time access control: every document query passes through here."""
    stmt = stmt.where(Document.access_level.in_(access_levels_for(user)))
    if statuses and has_permission(user.role, Permission.knowledge_manage):
        return stmt.where(Document.status.in_(statuses))
    return stmt.where(Document.status == DocStatus.active)


def _filters(stmt: Select, *, verticals, doc_types, source_id, date_from, date_to, entity_ids, sample) -> Select:
    if verticals:
        stmt = stmt.where(Document.vertical.in_(verticals))
    if doc_types:
        stmt = stmt.where(Document.doc_type.in_(doc_types))
    if source_id:
        stmt = stmt.where(Document.source_id == source_id)
    if date_from:
        stmt = stmt.where(Document.published_at >= datetime.combine(date_from, time.min, UTC))
    if date_to:
        stmt = stmt.where(Document.published_at <= datetime.combine(date_to, time.max, UTC))
    for eid in entity_ids or []:
        stmt = stmt.where(exists().where(and_(DocumentEntity.document_id == Document.id,
                                              DocumentEntity.entity_id == eid)))
    if sample is not None:
        stmt = stmt.where(Document.is_sample.is_(sample))
    return stmt


@router.get("/documents", response_model=Page[DocumentListItem])
def search_documents(
    q: str | None = Query(None, max_length=500),
    vertical: list[Vertical] = Query(default=[]),
    doc_type: list[DocType] = Query(default=[]),
    source_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    entity_id: list[uuid.UUID] = Query(default=[]),
    status: list[DocStatus] = Query(default=[]),
    sample: bool | None = None,
    sort: Literal["relevance", "newest", "oldest", "title"] = "relevance",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(can_read),
):
    tsq = func.websearch_to_tsquery("english", q) if q and q.strip() else None
    rank = func.ts_rank_cd(Document.search_tsv, tsq, 32) if tsq is not None else literal(None)
    snippet = (func.ts_headline("english", func.left(Document.content_text, 20000), tsq,
                                "MaxWords=35, MinWords=15, MaxFragments=2, StartSel=<<, StopSel=>>")
               if tsq is not None else func.left(func.coalesce(Document.summary, Document.content_text), 280))

    base = select(Document.id).join(Source, Source.id == Document.source_id)
    base = _visible(base, user, status)
    base = _filters(base, verticals=vertical, doc_types=doc_type, source_id=source_id, date_from=date_from,
                    date_to=date_to, entity_ids=entity_id, sample=sample)
    if tsq is not None:
        base = base.where(Document.search_tsv.op("@@")(tsq))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    stmt = select(Document, Source.name, snippet.label("snippet"), rank.label("rank")).join(
        Source, Source.id == Document.source_id).where(Document.id.in_(base))
    if sort == "relevance" and tsq is not None:
        stmt = stmt.order_by(rank.desc(), Document.published_at.desc().nulls_last())
    elif sort == "oldest":
        stmt = stmt.order_by(Document.published_at.asc().nulls_last())
    elif sort == "title":
        stmt = stmt.order_by(Document.title.asc())
    else:
        stmt = stmt.order_by(Document.published_at.desc().nulls_last(), Document.created_at.desc())
    rows = db.execute(stmt.limit(limit).offset(offset)).all()

    items = [
        DocumentListItem(
            id=d.id, title=d.title, url=d.url, canonical_url=d.canonical_url, doc_type=d.doc_type,
            vertical=d.vertical, source_id=d.source_id, source_name=src, author=d.author, category=d.category,
            published_at=d.published_at, status=d.status, access_level=d.access_level, word_count=d.word_count,
            is_sample=d.is_sample, snippet=snip, rank=float(r) if r is not None else None)
        for d, src, snip, r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/documents/facets", response_model=DocumentFacets)
def document_facets(db: Session = Depends(get_db), user: User = Depends(can_read)):
    def grouped(col):
        stmt = _visible(select(col, func.count()).select_from(Document), user).group_by(col).order_by(
            func.count().desc())
        return [FacetBucket(value=str(v.value if hasattr(v, "value") else v), count=c)
                for v, c in db.execute(stmt).all() if v is not None]

    year = extract("year", Document.published_at)
    years = _visible(select(year, func.count()).select_from(Document), user).group_by(year).order_by(year.desc())
    sources = _visible(select(Source.id, Source.name, func.count(Document.id)).join(
        Document, Document.source_id == Source.id), user).group_by(Source.id, Source.name)
    total = db.scalar(_visible(select(func.count()).select_from(Document), user)) or 0
    return DocumentFacets(
        total=total,
        verticals=grouped(Document.vertical),
        doc_types=grouped(Document.doc_type),
        years=[FacetBucket(value=str(int(y)), count=c) for y, c in db.execute(years).all() if y is not None],
        sources=[{"id": str(i), "name": n, "count": c} for i, n, c in db.execute(sources).all()],
    )


@router.get("/entities", response_model=list[EntityOut])
def list_entities(entity_type: EntityType | None = None, q: str | None = Query(None, max_length=200),
                  limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
                  user: User = Depends(can_read)):
    doc_count = func.count(distinct(Document.id))
    stmt = (select(Entity, doc_count).join(DocumentEntity, DocumentEntity.entity_id == Entity.id)
            .join(Document, Document.id == DocumentEntity.document_id))
    stmt = _visible(stmt, user)
    if entity_type:
        stmt = stmt.where(Entity.entity_type == entity_type)
    if q:
        stmt = stmt.where(Entity.normalized_name.ilike(f"%{q.lower()}%"))
    stmt = stmt.group_by(Entity.id).order_by(doc_count.desc(), Entity.name).limit(limit)
    return [EntityOut(id=e.id, entity_type=e.entity_type, name=e.name, document_count=c)
            for e, c in db.execute(stmt).all()]


def _get_visible_doc(db: Session, user: User, document_id: uuid.UUID) -> Document:
    stmt = _visible(select(Document).where(Document.id == document_id), user, list(DocStatus))
    doc = db.scalar(stmt)
    if not doc:
        raise NotFound("Document not found.")
    return doc


@router.get("/documents/{document_id}", response_model=DocumentDetail)
def get_document(document_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(can_read)):
    d = _get_visible_doc(db, user, document_id)
    src = db.scalar(select(Source.name).where(Source.id == d.source_id)) or ""
    ents = db.execute(select(Entity, DocumentEntity).join(DocumentEntity, DocumentEntity.entity_id == Entity.id)
                      .where(DocumentEntity.document_id == d.id).order_by(Entity.entity_type, Entity.name)).all()
    chunk_count = db.scalar(select(func.count()).where(Chunk.document_id == d.id)) or 0
    active_chunks = db.scalar(select(func.count()).where(Chunk.document_id == d.id, Chunk.is_active)) or 0
    models = db.scalars(select(distinct(ChunkEmbedding.embedding_model)).join(
        Chunk, Chunk.id == ChunkEmbedding.chunk_id).where(Chunk.document_id == d.id)).all()
    versions = db.scalar(select(func.count()).where(DocumentVersion.document_id == d.id)) or 0
    return DocumentDetail(
        id=d.id, title=d.title, url=d.url, canonical_url=d.canonical_url, doc_type=d.doc_type, vertical=d.vertical,
        source_id=d.source_id, source_name=src, author=d.author, category=d.category, published_at=d.published_at,
        status=d.status, access_level=d.access_level, word_count=d.word_count, is_sample=d.is_sample,
        summary=d.summary, content_text=d.content_text, tags=d.tags or [], language=d.language,
        source_updated_at=d.source_updated_at, page_count=d.page_count, duration_seconds=d.duration_seconds,
        video_id=d.video_id, channel_name=d.channel_name, event_name=d.event_name, event_date=d.event_date,
        version=d.version, duplicate_of=d.duplicate_of, metadata=d.metadata_, created_at=d.created_at,
        updated_at=d.updated_at,
        entities=[EntityRef(id=e.id, entity_type=e.entity_type, name=e.name, role=de.role,
                            designation=de.designation, mention_count=de.mention_count) for e, de in ents],
        chunk_count=chunk_count, active_chunk_count=active_chunks, embedding_models=list(models),
        version_count=versions,
    )


@router.get("/documents/{document_id}/chunks", response_model=Page[ChunkOut])
def get_chunks(document_id: uuid.UUID, include_inactive: bool = False, limit: int = Query(50, ge=1, le=200),
               offset: int = Query(0, ge=0), db: Session = Depends(get_db), user: User = Depends(can_read)):
    _get_visible_doc(db, user, document_id)
    stmt = select(Chunk).where(Chunk.document_id == document_id)
    if not include_inactive:
        stmt = stmt.where(Chunk.is_active)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    chunks = db.scalars(stmt.order_by(Chunk.document_version.desc(), Chunk.chunk_index)
                        .limit(limit).offset(offset)).all()
    emb: dict[uuid.UUID, list[str]] = {}
    if chunks:
        for cid, model in db.execute(select(ChunkEmbedding.chunk_id, ChunkEmbedding.embedding_model)
                                     .where(ChunkEmbedding.chunk_id.in_([c.id for c in chunks]))).all():
            emb.setdefault(cid, []).append(model)
    items = []
    for c in chunks:
        o = ChunkOut.model_validate({**{k: getattr(c, k) for k in ChunkOut.model_fields if hasattr(c, k)},
                                     "metadata": c.metadata_, "embedding_models": emb.get(c.id, [])})
        items.append(o)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.patch("/documents/{document_id}", response_model=DocumentDetail)
def update_document(document_id: uuid.UUID, body: DocumentUpdate, db: Session = Depends(get_db),
                    actor: User = Depends(can_manage), ctx: RequestContext = Depends(request_context)):
    """Soft changes only. `status=deleted` removes a document from retrieval but keeps it for provenance."""
    d = _get_visible_doc(db, actor, document_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    before = {k: getattr(d, k) for k in changes}
    for k, v in changes.items():
        setattr(d, k, v)
    audit.record(db, actor=actor, action="document.update", resource_type="document", resource_id=d.id,
                 ctx=ctx, details={"before": before, "after": changes})
    db.commit()
    return get_document(document_id, db, actor)


@router.post("/documents/{document_id}/reprocess", status_code=202)
def reprocess_document(document_id: uuid.UUID, db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    _get_visible_doc(db, actor, document_id)
    raise EngineNotReady("Document reprocessing", 2)


@router.get("/knowledge/index-health")
def index_health(db: Session = Depends(get_db), _: User = Depends(can_read)):
    """Real counts describing corpus and index completeness."""
    by_status = dict(db.execute(select(Document.status, func.count()).group_by(Document.status)).all())
    active_docs = by_status.get(DocStatus.active, 0)
    docs_without_chunks = db.scalar(select(func.count()).select_from(Document).where(
        Document.status == DocStatus.active,
        ~exists().where(and_(Chunk.document_id == Document.id, Chunk.is_active)))) or 0
    total_chunks = db.scalar(select(func.count()).select_from(Chunk)) or 0
    active_chunks = db.scalar(select(func.count()).select_from(Chunk).where(Chunk.is_active)) or 0
    emb_models = db.execute(select(ChunkEmbedding.embedding_model, ChunkEmbedding.dim, func.count())
                            .join(Chunk, Chunk.id == ChunkEmbedding.chunk_id).where(Chunk.is_active)
                            .group_by(ChunkEmbedding.embedding_model, ChunkEmbedding.dim)).all()
    crawl = dict(db.execute(select(CrawlUrl.status, func.count()).group_by(CrawlUrl.status)).all())
    sample_docs = db.scalar(select(func.count()).select_from(Document).where(Document.is_sample)) or 0
    return {
        "documents": {"active": active_docs, "by_status": {k.value: v for k, v in by_status.items()},
                      "without_chunks": docs_without_chunks, "sample": sample_docs},
        "chunks": {"total": total_chunks, "active": active_chunks},
        "embeddings": [{"model": m, "dim": dim, "chunks": c,
                        "coverage": (c / active_chunks) if active_chunks else None} for m, dim, c in emb_models],
        "crawl_urls": {k.value: v for k, v in crawl.items()},
        "failed_urls": crawl.get(CrawlStatus.failed, 0),
    }
