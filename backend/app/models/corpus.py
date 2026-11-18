import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Computed,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, str_enum, updated_at_col, uuid_pk
from app.models.enums import AccessLevel, DocStatus, DocType, EntityRole, EntityType, RelationType, Vertical

DOC_TSV = (
    "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(summary, '')), 'B') || "
    "setweight(to_tsvector('english', coalesce(left(content_text, 200000), '')), 'C')"
)
CHUNK_TSV = (
    "setweight(to_tsvector('english', coalesce(context_prefix, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(text, '')), 'B')"
)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_documents_source_external"),
        Index("uq_documents_canonical_active", "canonical_url", unique=True,
              postgresql_where=text("status = 'active'")),
        Index("ix_documents_vertical_published", "vertical", text("published_at DESC")),
        Index("ix_documents_source", "source_id"),
        Index("ix_documents_doc_type", "doc_type"),
        Index("ix_documents_status", "status"),
        Index("ix_documents_search_tsv", "search_tsv", postgresql_using="gin"),
        Index("ix_documents_title_trgm", "title", postgresql_using="gin",
              postgresql_ops={"title": "gin_trgm_ops"}),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                 ForeignKey("sources.id", ondelete="RESTRICT"), nullable=False)
    doc_type: Mapped[DocType] = mapped_column(str_enum(DocType, "doc_type"), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_url: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str | None] = mapped_column(String(300))
    category: Mapped[str | None] = mapped_column(String(200))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(120)), nullable=False, default=list,
                                            server_default="{}")
    language: Mapped[str | None] = mapped_column(String(12))
    vertical: Mapped[Vertical] = mapped_column(str_enum(Vertical, "vertical"), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary: Mapped[str | None] = mapped_column(Text)
    content_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    page_count: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    video_id: Mapped[str | None] = mapped_column(String(32))
    channel_name: Mapped[str | None] = mapped_column(String(200))
    event_name: Mapped[str | None] = mapped_column(String(300))
    event_date: Mapped[date | None] = mapped_column(Date)
    access_level: Mapped[AccessLevel] = mapped_column(str_enum(AccessLevel, "access_level"), nullable=False,
                                                      default=AccessLevel.public)
    status: Mapped[DocStatus] = mapped_column(str_enum(DocStatus, "doc_status"), nullable=False,
                                              default=DocStatus.active)
    duplicate_of: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                          ForeignKey("documents.id", ondelete="SET NULL"))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict,
                                            server_default="{}")
    search_tsv = mapped_column(TSVECTOR, Computed(DOC_TSV, persisted=True))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version", name="uq_document_versions_doc_version"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                   ForeignKey("documents.id", ondelete="CASCADE"),
                                                   nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    captured_at: Mapped[datetime] = created_at_col()


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "document_version", "chunk_index", name="uq_chunks_doc_ver_idx"),
        Index("ix_chunks_search_tsv", "search_tsv", postgresql_using="gin"),
        Index("ix_chunks_document_active", "document_id", "is_active"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                   ForeignKey("documents.id", ondelete="CASCADE"),
                                                   nullable=False)
    document_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    context_prefix: Mapped[str | None] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    char_start: Mapped[int | None] = mapped_column(Integer)
    char_end: Mapped[int | None] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer)
    timestamp_start: Mapped[float | None] = mapped_column(Float)
    timestamp_end: Mapped[float | None] = mapped_column(Float)
    section_heading: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict,
                                            server_default="{}")
    search_tsv = mapped_column(TSVECTOR, Computed(CHUNK_TSV, persisted=True))
    created_at: Mapped[datetime] = created_at_col()


class ChunkEmbedding(Base):
    """One row per (chunk, embedding model). `embedding` has no fixed dimension; per-model partial HNSW
    expression indexes are created by the indexing pipeline (Phase 3)."""

    __tablename__ = "chunk_embeddings"

    chunk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                ForeignKey("chunks.id", ondelete="CASCADE"), primary_key=True)
    embedding_model: Mapped[str] = mapped_column(String(120), primary_key=True)
    dim: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding = mapped_column(Vector(), nullable=False)
    created_at: Mapped[datetime] = created_at_col()


class Entity(Base):
    __tablename__ = "entities"
    __table_args__ = (
        UniqueConstraint("entity_type", "normalized_name", name="uq_entities_type_name"),
        Index("ix_entities_name_trgm", "normalized_name", postgresql_using="gin",
              postgresql_ops={"normalized_name": "gin_trgm_ops"}),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    entity_type: Mapped[EntityType] = mapped_column(str_enum(EntityType, "entity_type"), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(300), nullable=False)
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = created_at_col()


class DocumentEntity(Base):
    __tablename__ = "document_entities"
    __table_args__ = (Index("ix_document_entities_entity", "entity_id"),)

    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                   ForeignKey("documents.id", ondelete="CASCADE"),
                                                   primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                 ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[EntityRole] = mapped_column(str_enum(EntityRole, "entity_role"), primary_key=True)
    designation: Mapped[str | None] = mapped_column(String(300))
    mention_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    first_chunk_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                            ForeignKey("chunks.id", ondelete="SET NULL"))


class DocumentRelation(Base):
    __tablename__ = "document_relations"

    from_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                        ForeignKey("documents.id", ondelete="CASCADE"),
                                                        primary_key=True)
    to_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                      ForeignKey("documents.id", ondelete="CASCADE"),
                                                      primary_key=True)
    relation_type: Mapped[RelationType] = mapped_column(str_enum(RelationType, "relation_type"),
                                                        primary_key=True)
    created_at: Mapped[datetime] = created_at_col()
