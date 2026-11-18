import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, str_enum, updated_at_col, uuid_pk
from app.models.enums import MessageRole, MessageStatus, QueryType, UsageEventType


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_user_updated", "user_id", text("updated_at DESC")),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                                               nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False, default="New conversation")
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class RetrievalTrace(Base):
    __tablename__ = "retrieval_traces"
    __table_args__ = (Index("ix_retrieval_traces_created", text("created_at DESC")),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                     ForeignKey("users.id", ondelete="SET NULL"))
    query: Mapped[str] = mapped_column(Text, nullable=False)
    query_type: Mapped[QueryType | None] = mapped_column(str_enum(QueryType, "query_type"))
    classification: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    dense_results: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    lexical_results: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    fused_results: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    reranked_results: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    final_evidence: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    citation_checks: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    timings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    total_latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at_col()


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_conversation_created", "conversation_id", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                       ForeignKey("conversations.id", ondelete="CASCADE"),
                                                       nullable=False)
    role: Mapped[MessageRole] = mapped_column(str_enum(MessageRole, "message_role"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[MessageStatus] = mapped_column(str_enum(MessageStatus, "message_status"), nullable=False,
                                                  default=MessageStatus.complete)
    query_type: Mapped[QueryType | None] = mapped_column(str_enum(QueryType, "query_type"))
    citations: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    related_questions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    trace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                      ForeignKey("retrieval_traces.id", ondelete="SET NULL"))
    model: Mapped[str | None] = mapped_column(String(120))
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    feedback: Mapped[int | None] = mapped_column(SmallInteger)
    error_code: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = created_at_col()


class UsageEvent(Base):
    __tablename__ = "usage_events"
    __table_args__ = (Index("ix_usage_events_type_created", "event_type", text("created_at DESC")),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                     ForeignKey("users.id", ondelete="SET NULL"))
    event_type: Mapped[UsageEventType] = mapped_column(str_enum(UsageEventType, "usage_event_type"),
                                                       nullable=False)
    model: Mapped[str | None] = mapped_column(String(120))
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    embedding_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0, server_default="0")
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    retrieval_latency_ms: Mapped[int | None] = mapped_column(Integer)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    error_code: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = created_at_col()
