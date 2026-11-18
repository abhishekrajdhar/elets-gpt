"""Typed, validated runtime settings stored in `app_settings`. Secrets are never stored here."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSetting


class LLMSettings(BaseModel):
    provider: Literal["anthropic", "openai", "openai_compatible", "google"] = "anthropic"
    model: str = Field("claude-sonnet-5-5", min_length=1, max_length=120)
    classifier_model: str = Field("claude-haiku-5-5", min_length=1, max_length=120)
    temperature: float = Field(0.1, ge=0, le=1)
    max_output_tokens: int = Field(1200, ge=64, le=16000)
    request_timeout_seconds: int = Field(60, ge=5, le=600)
    # Pricing is entered by an admin from the provider's current price list; cost stays "not configured"
    # until both are set, rather than guessing.
    input_price_per_mtok_usd: float | None = Field(None, ge=0)
    output_price_per_mtok_usd: float | None = Field(None, ge=0)


class EmbeddingSettings(BaseModel):
    provider: Literal["local", "openai_compatible", "voyage", "cohere"] = "local"
    model: str = Field("BAAI/bge-m3", min_length=1, max_length=120)
    dimension: int = Field(1024, ge=32, le=4096)
    batch_size: int = Field(32, ge=1, le=512)
    normalize: bool = True


class RerankerSettings(BaseModel):
    enabled: bool = True
    provider: Literal["local", "cohere", "voyage", "jina"] = "local"
    model: str = Field("BAAI/bge-reranker-v2-m3", min_length=1, max_length=120)
    top_n: int = Field(30, ge=1, le=200)


class RetrievalSettings(BaseModel):
    dense_top_k: int = Field(50, ge=1, le=500)
    lexical_top_k: int = Field(50, ge=1, le=500)
    rrf_k: int = Field(60, ge=1, le=1000)
    rrf_weight_dense: float = Field(1.0, ge=0, le=10)
    rrf_weight_lexical: float = Field(1.0, ge=0, le=10)
    final_context_k: int = Field(8, ge=1, le=50)
    max_context_tokens: int = Field(6000, ge=500, le=100000)
    per_document_cap: int = Field(3, ge=1, le=20)
    abstain_threshold: float = Field(0.35, ge=0, le=1)
    classifier_mode: Literal["rules", "rules+llm"] = "rules+llm"

    @model_validator(mode="after")
    def _weights(self):
        if self.rrf_weight_dense == 0 and self.rrf_weight_lexical == 0:
            raise ValueError("At least one RRF lane weight must be greater than zero.")
        return self


class UsageLimits(BaseModel):
    chat_requests_per_minute: int = Field(20, ge=1, le=1000)
    chat_requests_per_day: int = Field(500, ge=1, le=100000)
    max_question_chars: int = Field(4000, ge=100, le=20000)
    monthly_budget_usd: float | None = Field(None, ge=0)


SETTINGS_MODELS: dict[str, type[BaseModel]] = {
    "llm": LLMSettings,
    "embedding": EmbeddingSettings,
    "reranker": RerankerSettings,
    "retrieval": RetrievalSettings,
    "usage_limits": UsageLimits,
}


def get_setting(db: Session, key: str) -> BaseModel:
    model = SETTINGS_MODELS[key]
    row = db.get(AppSetting, key)
    if row is None:
        return model()
    # Merge stored values over defaults so new fields get defaults automatically.
    return model.model_validate({**model().model_dump(), **row.value})


def get_all(db: Session) -> dict[str, dict]:
    return {k: get_setting(db, k).model_dump() for k in SETTINGS_MODELS}


def put_setting(db: Session, key: str, value: dict, user_id) -> BaseModel:
    model = SETTINGS_MODELS[key]
    validated = model.model_validate(value)
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=validated.model_dump(), updated_by=user_id))
    else:
        row.value = validated.model_dump()
        row.updated_by = user_id
    return validated


PROVIDER_ENV: dict[str, list[tuple[str, str]]] = {
    # provider -> [(env var, settings attribute)]
    "anthropic": [("ANTHROPIC_API_KEY", "anthropic_api_key")],
    "openai": [("OPENAI_API_KEY", "openai_api_key")],
    "openai_compatible": [("OPENAI_API_KEY", "openai_api_key"), ("OPENAI_BASE_URL", "openai_base_url")],
    "google": [("GOOGLE_API_KEY", "google_api_key")],
    "voyage": [("VOYAGE_API_KEY", "voyage_api_key")],
    "cohere": [("COHERE_API_KEY", "cohere_api_key")],
    "youtube": [("YOUTUBE_API_KEY", "youtube_api_key")],
    "local": [],
    "jina": [],
}


def provider_status() -> list[dict]:
    """Which providers have credentials configured. Never returns secret values."""
    s = get_settings()
    out = []
    for provider, envs in PROVIDER_ENV.items():
        if provider == "jina":
            continue
        missing = [env for env, attr in envs if not getattr(s, attr)]
        out.append({
            "provider": provider,
            "env_vars": [env for env, _ in envs],
            "configured": not missing,
            "missing": missing,
            "requires_credentials": bool(envs),
        })
    return out
