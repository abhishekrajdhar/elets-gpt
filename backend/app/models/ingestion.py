import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, str_enum, updated_at_col, uuid_pk
from app.models.enums import (
    AccessLevel,
    CrawlStatus,
    DiscoveredVia,
    JobStatus,
    JobTrigger,
    JobType,
    LogLevel,
    SourceType,
    Vertical,
)


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    source_type: Mapped[SourceType] = mapped_column(str_enum(SourceType, "source_type"), nullable=False)
    base_url: Mapped[str] = mapped_column(Text, nullable=False)
    vertical: Mapped[Vertical] = mapped_column(str_enum(Vertical, "vertical"), nullable=False)
    access_level: Mapped[AccessLevel] = mapped_column(str_enum(AccessLevel, "access_level"), nullable=False,
                                                      default=AccessLevel.public)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    description: Mapped[str | None] = mapped_column(Text)
    crawl_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    schedule_cron: Mapped[str | None] = mapped_column(String(100))
    last_crawl_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_crawl_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                        ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"
    __table_args__ = (Index("ix_ingestion_jobs_source_created", "source_id", text("created_at DESC")),
                      Index("ix_ingestion_jobs_status", "status"))

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                 ForeignKey("sources.id", ondelete="CASCADE"), nullable=False)
    job_type: Mapped[JobType] = mapped_column(str_enum(JobType, "job_type"), nullable=False)
    status: Mapped[JobStatus] = mapped_column(str_enum(JobStatus, "job_status"), nullable=False,
                                              default=JobStatus.queued)
    trigger: Mapped[JobTrigger] = mapped_column(str_enum(JobTrigger, "job_trigger"), nullable=False,
                                                default=JobTrigger.manual)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                          ForeignKey("users.id", ondelete="SET NULL"))
    celery_task_id: Mapped[str | None] = mapped_column(String(80))
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()


class IngestionLog(Base):
    __tablename__ = "ingestion_logs"
    __table_args__ = (Index("ix_ingestion_logs_job_created", "job_id", "created_at"),
                      Index("ix_ingestion_logs_level_created", "level", text("created_at DESC")))

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                              ForeignKey("ingestion_jobs.id", ondelete="CASCADE"),
                                              nullable=False)
    level: Mapped[LogLevel] = mapped_column(str_enum(LogLevel, "log_level"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str | None] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = created_at_col()


class CrawlUrl(Base):
    __tablename__ = "crawl_urls"
    __table_args__ = (UniqueConstraint("source_id", "url_hash", name="uq_crawl_urls_source_hash"),
                      Index("ix_crawl_urls_status_retry", "status", "next_retry_at"))

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                 ForeignKey("sources.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    url_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical_url: Mapped[str | None] = mapped_column(Text)
    discovered_via: Mapped[DiscoveredVia] = mapped_column(str_enum(DiscoveredVia, "discovered_via"),
                                                          nullable=False)
    status: Mapped[CrawlStatus] = mapped_column(str_enum(CrawlStatus, "crawl_status"), nullable=False,
                                                default=CrawlStatus.pending)
    http_status: Mapped[int | None] = mapped_column(Integer)
    etag: Mapped[str | None] = mapped_column(String(300))
    last_modified: Mapped[str | None] = mapped_column(String(100))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    sitemap_lastmod: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                         ForeignKey("documents.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
