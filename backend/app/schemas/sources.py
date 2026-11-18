import re
import uuid
from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from croniter import croniter
from pydantic import BaseModel, Field, field_validator

from app.models.enums import AccessLevel, JobStatus, JobTrigger, JobType, LogLevel, SourceType, Vertical
from app.schemas.common import ORM

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")
DiscoveryMethod = Literal["robots", "sitemap", "rss", "wp_api", "links", "youtube_api"]


class CrawlConfig(BaseModel):
    discovery: list[DiscoveryMethod] = ["robots", "sitemap", "rss", "wp_api"]
    max_pages: int = Field(5000, ge=1, le=500_000)
    rate_limit_rps: float = Field(0.5, gt=0, le=5)
    # robots.txt compliance cannot be switched off.
    respect_robots: Literal[True] = True
    allowed_paths: list[str] = Field(default_factory=list, max_length=100)
    blocked_paths: list[str] = Field(default_factory=list, max_length=200)
    max_pdf_mb: int | None = Field(None, ge=1, le=500)
    ocr: Literal["auto", "always", "never"] | None = None
    max_videos: int | None = Field(None, ge=1, le=100_000)
    captions: Literal["public_only"] | None = None

    @field_validator("allowed_paths", "blocked_paths")
    @classmethod
    def _paths(cls, v: list[str]) -> list[str]:
        for p in v:
            if not p.startswith("/") or len(p) > 300:
                raise ValueError("Paths must start with '/' and be at most 300 characters.")
        return v


def _validate_url(v: str) -> str:
    v = v.strip()
    parsed = urlparse(v)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Must be an absolute http(s) URL.")
    if parsed.username or parsed.password:
        raise ValueError("URLs must not contain credentials.")
    return v


def _validate_cron(v: str | None) -> str | None:
    if v is None or v.strip() == "":
        return None
    v = v.strip()
    if not croniter.is_valid(v):
        raise ValueError("Invalid cron expression (expected 5 fields, e.g. '0 2 * * *').")
    return v


class SourceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str
    source_type: SourceType
    base_url: str = Field(max_length=2000)
    vertical: Vertical
    access_level: AccessLevel = AccessLevel.public
    enabled: bool = True
    description: str | None = Field(None, max_length=2000)
    crawl_config: CrawlConfig = Field(default_factory=CrawlConfig)
    schedule_cron: str | None = None

    @field_validator("base_url")
    @classmethod
    def _url(cls, v: str) -> str:
        return _validate_url(v)

    @field_validator("schedule_cron")
    @classmethod
    def _cron(cls, v: str | None) -> str | None:
        return _validate_cron(v)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("Slug must be 3-80 lowercase letters, digits or hyphens.")
        return v


class SourceUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    base_url: str | None = Field(None, max_length=2000)
    vertical: Vertical | None = None
    access_level: AccessLevel | None = None
    enabled: bool | None = None
    description: str | None = Field(None, max_length=2000)
    crawl_config: CrawlConfig | None = None
    schedule_cron: str | None = None

    @field_validator("base_url")
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        return v if v is None else _validate_url(v)

    @field_validator("schedule_cron")
    @classmethod
    def _cron(cls, v: str | None) -> str | None:
        return _validate_cron(v)


class JobBrief(ORM):
    id: uuid.UUID
    job_type: JobType
    status: JobStatus
    created_at: datetime
    finished_at: datetime | None


class SourceOut(ORM):
    id: uuid.UUID
    name: str
    slug: str
    source_type: SourceType
    base_url: str
    vertical: Vertical
    access_level: AccessLevel
    enabled: bool
    description: str | None
    crawl_config: dict
    schedule_cron: str | None
    last_crawl_started_at: datetime | None
    last_crawl_finished_at: datetime | None
    last_success_at: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    failed_url_count: int = 0
    latest_job: JobBrief | None = None
    requires_credentials: list[str] = []
    credentials_configured: bool = True


class JobOut(ORM):
    id: uuid.UUID
    source_id: uuid.UUID
    source_name: str | None = None
    job_type: JobType
    status: JobStatus
    trigger: JobTrigger
    stats: dict
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class JobCreate(BaseModel):
    job_type: JobType = JobType.incremental


class LogOut(ORM):
    id: int
    job_id: uuid.UUID
    level: LogLevel
    message: str
    url: str | None
    context: dict
    created_at: datetime
