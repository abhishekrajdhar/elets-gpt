import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, str_enum, uuid_pk
from app.models.enums import EvalCategory, EvalRunStatus, EvalStrategy, ReviewStatus


class EvalDataset(Base):
    __tablename__ = "eval_datasets"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                        ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_at_col()


class EvalQuestion(Base):
    __tablename__ = "eval_questions"

    id: Mapped[uuid.UUID] = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                  ForeignKey("eval_datasets.id", ondelete="CASCADE"),
                                                  nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[EvalCategory] = mapped_column(str_enum(EvalCategory, "eval_category"), nullable=False)
    expected_answer: Mapped[str | None] = mapped_column(Text)
    expected_document_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False,
                                                                  default=list, server_default="{}")
    expected_chunk_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False,
                                                               default=list, server_default="{}")
    should_abstain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    review_status: Mapped[ReviewStatus] = mapped_column(str_enum(ReviewStatus, "review_status"),
                                                        nullable=False, default=ReviewStatus.draft)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                         ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    dataset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                  ForeignKey("eval_datasets.id", ondelete="CASCADE"),
                                                  nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    strategy: Mapped[EvalStrategy] = mapped_column(str_enum(EvalStrategy, "eval_strategy"), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    status: Mapped[EvalRunStatus] = mapped_column(str_enum(EvalRunStatus, "eval_run_status"), nullable=False,
                                                  default=EvalRunStatus.queued)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                        ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_at_col()


class EvalResult(Base):
    __tablename__ = "eval_results"

    id: Mapped[uuid.UUID] = uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("eval_runs.id", ondelete="CASCADE"),
                                              nullable=False, index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                   ForeignKey("eval_questions.id", ondelete="CASCADE"),
                                                   nullable=False)
    retrieved: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    answer: Mapped[str | None] = mapped_column(Text)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    tokens: Mapped[int | None] = mapped_column(Integer)
    judge: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    human_verdict: Mapped[str | None] = mapped_column(String(30))
    human_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_col()
