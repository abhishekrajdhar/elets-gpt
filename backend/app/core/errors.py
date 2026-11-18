"""Uniform API error envelope: {"error": {"code", "message", "details", "request_id"}}."""

from typing import Any


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None,
                 details: Any = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.details = details


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"


class EngineNotReady(AppError):
    """Raised by endpoints whose engine phase has not been implemented yet."""

    status_code = 503
    code = "engine_not_ready"

    def __init__(self, feature: str, phase: int, message: str | None = None):
        super().__init__(
            message or f"{feature} is not enabled yet. It is delivered in Phase {phase}.",
            details={"feature": feature, "phase": phase},
        )
