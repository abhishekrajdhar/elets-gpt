"""Conversations and the streaming answer endpoint.

SSE event contract (stable; the frontend already implements every event):
  user_message       {message}                      persisted user turn
  assistant_message  {message}                      assistant turn created (status=streaming)
  stage              {stage, status, detail?}       pipeline progress: classify|retrieve|rerank|generate|verify
  token              {delta}                        streamed answer text
  citations          {citations: [...]}             verified citations (URLs come from DB rows only)
  related            {questions: [...]}
  error              {code, message, details?}
  done               {message}                      final assistant message
"""

import json
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require
from app.core.errors import AppError, NotFound
from app.core.ratelimit import get_rate_limiter
from app.core.rbac import Permission
from app.db.session import SessionLocal, get_db
from app.models import Conversation, Message, User
from app.models.enums import MessageRole, MessageStatus
from app.schemas.common import Page
from app.schemas.conversations import (
    AskRequest,
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationUpdate,
    FeedbackRequest,
    MessageOut,
)
from app.services.app_settings import UsageLimits, get_setting
from app.services.capabilities import FEATURES, is_enabled

router = APIRouter(prefix="/conversations", tags=["workspace"])
can_chat = require(Permission.chat_use)


def _own(db: Session, user: User, conversation_id: uuid.UUID) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise NotFound("Conversation not found.")
    return conv


@router.get("", response_model=Page[ConversationOut])
def list_conversations(archived: bool = False, q: str | None = Query(None, max_length=200),
                       limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                       db: Session = Depends(get_db), user: User = Depends(can_chat)):
    count = select(func.count(Message.id)).where(Message.conversation_id == Conversation.id).scalar_subquery()
    stmt = select(Conversation, count.label("n")).where(Conversation.user_id == user.id,
                                                        Conversation.archived.is_(archived))
    if q:
        stmt = stmt.where(Conversation.title.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(Conversation.updated_at.desc()).limit(limit).offset(offset)).all()
    items = []
    for c, n in rows:
        o = ConversationOut.model_validate(c)
        o.message_count = n
        items.append(o)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(body: ConversationCreate, db: Session = Depends(get_db), user: User = Depends(can_chat)):
    conv = Conversation(user_id=user.id, title=(body.title or "New conversation").strip()[:300],
                        filters=body.filters.model_dump(mode="json"))
    db.add(conv)
    db.commit()
    return ConversationOut.model_validate(conv)


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(can_chat)):
    conv = _own(db, user, conversation_id)
    msgs = db.scalars(select(Message).where(Message.conversation_id == conv.id)
                      .order_by(Message.created_at, Message.role.desc())).all()
    return ConversationDetail(**ConversationOut.model_validate(conv).model_dump(exclude={"message_count"}),
                              message_count=len(msgs), messages=[MessageOut.model_validate(m) for m in msgs])


@router.patch("/{conversation_id}", response_model=ConversationOut)
def update_conversation(conversation_id: uuid.UUID, body: ConversationUpdate, db: Session = Depends(get_db),
                        user: User = Depends(can_chat)):
    conv = _own(db, user, conversation_id)
    if body.title is not None:
        conv.title = body.title.strip()
    if body.filters is not None:
        conv.filters = body.filters.model_dump(mode="json")
    if body.archived is not None:
        conv.archived = body.archived
    db.commit()
    return ConversationOut.model_validate(conv)


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(can_chat)):
    db.delete(_own(db, user, conversation_id))
    db.commit()


@router.post("/{conversation_id}/messages/{message_id}/feedback", response_model=MessageOut)
def message_feedback(conversation_id: uuid.UUID, message_id: uuid.UUID, body: FeedbackRequest,
                     db: Session = Depends(get_db), user: User = Depends(can_chat)):
    conv = _own(db, user, conversation_id)
    msg = db.get(Message, message_id)
    if not msg or msg.conversation_id != conv.id or msg.role != MessageRole.assistant:
        raise NotFound("Message not found.")
    msg.feedback = body.feedback
    db.commit()
    return MessageOut.model_validate(msg)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.post("/{conversation_id}/messages")
def ask(conversation_id: uuid.UUID, body: AskRequest, db: Session = Depends(get_db),
        user: User = Depends(can_chat)):
    conv = _own(db, user, conversation_id)
    limits: UsageLimits = get_setting(db, "usage_limits")  # type: ignore[assignment]
    content = body.content.strip()
    if not content:
        raise AppError("Question is empty.", code="validation_error", status_code=422)
    if len(content) > limits.max_question_chars:
        raise AppError(f"Questions are limited to {limits.max_question_chars} characters.",
                       code="validation_error", status_code=422)
    limiter = get_rate_limiter()
    limiter.hit(f"chat:min:{user.id}", limits.chat_requests_per_minute, 60)
    limiter.hit(f"chat:day:{user.id}", limits.chat_requests_per_day, 86400)

    if body.filters is not None:
        conv.filters = body.filters.model_dump(mode="json")
    first = not db.scalar(select(func.count()).where(Message.conversation_id == conv.id))
    if first and conv.title == "New conversation":
        conv.title = content[:80] + ("…" if len(content) > 80 else "")
    user_msg = Message(conversation_id=conv.id, role=MessageRole.user, content=content)
    db.add(user_msg)
    conv.updated_at = func.now()
    db.commit()
    db.refresh(user_msg)

    conv_id = conv.id
    user_msg_out = MessageOut.model_validate(user_msg).model_dump(mode="json")

    def stream() -> Iterator[str]:
        # The request-scoped session may be closed before streaming finishes, so use our own.
        yield _sse("user_message", {"message": user_msg_out})
        with SessionLocal() as sdb:
            yield from _answer(sdb, conv_id)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _answer(db: Session, conv_id: uuid.UUID) -> Iterator[str]:
    """Produce answer events. Until Phase 4 ships, this persists an explicit engine_not_ready reply."""
    if not is_enabled("chat_answers"):
        feature = FEATURES["chat_answers"]
        assistant = Message(
            conversation_id=conv_id, role=MessageRole.assistant, status=MessageStatus.error,
            error_code="engine_not_ready",
            content=("The answer engine is not enabled yet, so I can't answer from the Elets knowledge base. "
                     f"This feature ({feature['label'].lower()}) ships in Phase {feature['phase']}. "
                     "Your question has been saved in this conversation."),
        )
        db.add(assistant)
        db.commit()
        db.refresh(assistant)
        yield _sse("error", {"code": "engine_not_ready", "message": assistant.content,
                             "details": {"feature": "chat_answers", "phase": feature["phase"]}})
        yield _sse("done", {"message": MessageOut.model_validate(assistant).model_dump(mode="json")})
        return
    # Phase 4: classify -> retrieve -> rerank -> generate (token events) -> verify -> persist.
