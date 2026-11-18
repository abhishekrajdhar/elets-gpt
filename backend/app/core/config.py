"""Application configuration loaded from environment variables (never from code)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "EletsGPT 2.0"
    environment: Literal["development", "test", "staging", "production"] = "development"
    log_level: str = "INFO"

    database_url: str
    test_database_url: str | None = None
    db_pool_size: int = 10
    db_statement_timeout_ms: int = 15_000

    redis_url: str | None = None

    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 12
    cookie_name: str = "eletsgpt_session"
    cookie_secure: bool = True

    cors_origins: list[str] = []

    # Rate limits (per window of 60 s)
    login_rate_limit_per_minute: int = 10

    # Provider secrets — read from env only; surfaced to admins as configured / not configured.
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    google_api_key: str | None = None
    voyage_api_key: str | None = None
    cohere_api_key: str | None = None
    youtube_api_key: str | None = None

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _safe_defaults(self):
        if "CHANGE_ME" in self.jwt_secret:
            raise ValueError("JWT_SECRET still has its placeholder value; generate a random secret.")
        if self.environment in ("staging", "production") and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in staging/production (HTTPS only).")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment in ("staging", "production")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
