import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import AccessLevel, DocStatus, DocType, EntityRole, EntityType, Vertical
from app.schemas.common import ORM


class DocumentListItem(BaseModel):
    id: uuid.UUID
    title: str
    url: str
    canonical_url: str
    doc_type: DocType
    vertical: Vertical
    source_id: uuid.UUID
    source_name: str
    author: str | None
    category: str | None
    published_at: datetime | None
    status: DocStatus
    access_level: AccessLevel
    word_count: int
    is_sample: bool
    snippet: str | None = None
    rank: float | None = None


class EntityRef(BaseModel):
    id: uuid.UUID
    entity_type: EntityType
    name: str
    role: EntityRole
    designation: str | None = None
    mention_count: int = 1


class DocumentDetail(DocumentListItem):
    summary: str | None
    content_text: str
    tags: list[str]
    language: str | None
    source_updated_at: datetime | None
    page_count: int | None
    duration_seconds: int | None
    video_id: str | None
    channel_name: str | None
    event_name: str | None
    event_date: date | None
    version: int
    duplicate_of: uuid.UUID | None
    metadata: dict
    created_at: datetime
    updated_at: datetime
    entities: list[EntityRef]
    chunk_count: int
    active_chunk_count: int
    embedding_models: list[str]
    version_count: int


class DocumentUpdate(BaseModel):
    status: DocStatus | None = None
    access_level: AccessLevel | None = None
    vertical: Vertical | None = None


class ChunkOut(ORM):
    id: uuid.UUID
    document_id: uuid.UUID
    document_version: int
    chunk_index: int
    text: str
    context_prefix: str | None
    token_count: int
    char_start: int | None
    char_end: int | None
    page_number: int | None
    timestamp_start: float | None
    timestamp_end: float | None
    section_heading: str | None
    is_active: bool
    content_hash: str
    metadata: dict
    created_at: datetime
    embedding_models: list[str] = []


class FacetBucket(BaseModel):
    value: str
    count: int


class DocumentFacets(BaseModel):
    total: int
    verticals: list[FacetBucket]
    doc_types: list[FacetBucket]
    years: list[FacetBucket]
    sources: list[dict]


class EntityOut(BaseModel):
    id: uuid.UUID
    entity_type: EntityType
    name: str
    document_count: int
