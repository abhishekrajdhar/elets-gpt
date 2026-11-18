import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import MessageRole, MessageStatus, QueryType, Vertical
from app.schemas.common import ORM


class ChatFilters(BaseModel):
    verticals: list[Vertical] = Field(default_factory=list, max_length=10)
    date_from: date | None = None
    date_to: date | None = None
    doc_types: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _range(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to.")
        return self


class ConversationCreate(BaseModel):
    title: str | None = Field(None, max_length=300)
    filters: ChatFilters = Field(default_factory=ChatFilters)


class ConversationUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    filters: ChatFilters | None = None
    archived: bool | None = None


class ConversationOut(ORM):
    id: uuid.UUID
    title: str
    filters: dict
    archived: bool
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class MessageOut(ORM):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: MessageRole
    content: str
    status: MessageStatus
    query_type: QueryType | None
    citations: list
    related_questions: list
    trace_id: uuid.UUID | None
    model: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    cost_usd: Decimal | None
    latency_ms: int | None
    feedback: int | None
    error_code: str | None
    created_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class AskRequest(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    filters: ChatFilters | None = None


class FeedbackRequest(BaseModel):
    feedback: int = Field(ge=-1, le=1)


class InspectRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    filters: ChatFilters = Field(default_factory=ChatFilters)
