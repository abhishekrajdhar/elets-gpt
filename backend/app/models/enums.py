from enum import StrEnum

from app.core.rbac import AccessLevel, Role  # re-exported

__all__ = [
    "AccessLevel", "Role", "SourceType", "Vertical", "JobType", "JobStatus", "JobTrigger", "LogLevel",
    "CrawlStatus", "DiscoveredVia", "DocType", "DocStatus", "EntityType", "EntityRole", "RelationType",
    "MessageRole", "MessageStatus", "QueryType", "UsageEventType", "EvalCategory", "ReviewStatus",
    "EvalStrategy", "EvalRunStatus",
]


class SourceType(StrEnum):
    website = "website"
    wordpress = "wordpress"
    rss = "rss"
    sitemap = "sitemap"
    youtube_channel = "youtube_channel"
    pdf_collection = "pdf_collection"


class Vertical(StrEnum):
    general = "general"
    egov = "egov"
    bfsi = "bfsi"
    digital_learning = "digital_learning"
    healthcare = "healthcare"
    events = "events"
    magazine = "magazine"


class JobType(StrEnum):
    probe = "probe"
    discover = "discover"
    crawl = "crawl"
    incremental = "incremental"
    reindex = "reindex"
    youtube = "youtube"
    pdf = "pdf"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    partial = "partial"
    failed = "failed"
    cancelled = "cancelled"


class JobTrigger(StrEnum):
    manual = "manual"
    schedule = "schedule"
    api = "api"


class LogLevel(StrEnum):
    debug = "debug"
    info = "info"
    warning = "warning"
    error = "error"


class CrawlStatus(StrEnum):
    pending = "pending"
    fetched = "fetched"
    not_modified = "not_modified"
    failed = "failed"
    skipped = "skipped"
    blocked_robots = "blocked_robots"


class DiscoveredVia(StrEnum):
    sitemap = "sitemap"
    rss = "rss"
    wp_api = "wp_api"
    link = "link"
    youtube_api = "youtube_api"
    manual = "manual"


class DocType(StrEnum):
    article = "article"
    video = "video"
    pdf = "pdf"
    magazine_issue = "magazine_issue"
    event_page = "event_page"
    page = "page"


class DocStatus(StrEnum):
    active = "active"
    superseded = "superseded"
    duplicate = "duplicate"
    failed = "failed"
    deleted = "deleted"


class EntityType(StrEnum):
    organisation = "organisation"
    person = "person"
    event = "event"
    department = "department"
    state = "state"
    topic = "topic"


class EntityRole(StrEnum):
    speaker = "speaker"
    author = "author"
    mentioned = "mentioned"
    organiser = "organiser"
    subject = "subject"


class RelationType(StrEnum):
    links_to = "links_to"
    same_event = "same_event"
    video_of = "video_of"
    follow_up = "follow_up"
    part_of_issue = "part_of_issue"


class MessageRole(StrEnum):
    user = "user"
    assistant = "assistant"


class MessageStatus(StrEnum):
    complete = "complete"
    streaming = "streaming"
    abstained = "abstained"
    error = "error"


class QueryType(StrEnum):
    factual = "factual"
    quantitative = "quantitative"
    comparative = "comparative"
    temporal = "temporal"
    multi_hop = "multi_hop"
    entity_lookup = "entity_lookup"
    summarization = "summarization"
    out_of_domain = "out_of_domain"


class UsageEventType(StrEnum):
    chat = "chat"
    search = "search"
    inspect = "inspect"
    eval = "eval"
    embed = "embed"


class EvalCategory(StrEnum):
    factual = "factual"
    quantitative = "quantitative"
    comparative = "comparative"
    temporal = "temporal"
    multi_hop = "multi_hop"
    entity = "entity"
    unanswerable = "unanswerable"


class ReviewStatus(StrEnum):
    draft = "draft"
    verified = "verified"
    rejected = "rejected"


class EvalStrategy(StrEnum):
    baseline = "baseline"
    dense = "dense"
    bm25 = "bm25"
    hybrid = "hybrid"
    hybrid_rrf = "hybrid_rrf"
    hybrid_rrf_rerank = "hybrid_rrf_rerank"
    metadata_aware = "metadata_aware"
    sql = "sql"


class EvalRunStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
