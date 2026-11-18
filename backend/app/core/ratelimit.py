"""Fixed-window rate limiter backed by Redis, with an in-process fallback when Redis is unavailable."""

import logging
import threading
import time

import redis

from app.core.config import get_settings
from app.core.errors import RateLimited

log = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, redis_url: str | None):
        self._redis = redis.Redis.from_url(redis_url, socket_timeout=0.5) if redis_url else None
        self._local: dict[str, tuple[int, int]] = {}
        self._lock = threading.Lock()

    def _hit_local(self, key: str, window: int) -> int:
        bucket = int(time.time() // window)
        with self._lock:
            b, count = self._local.get(key, (bucket, 0))
            count = count + 1 if b == bucket else 1
            self._local[key] = (bucket, count)
            return count

    def hit(self, key: str, limit: int, window_seconds: int = 60) -> None:
        if limit <= 0:
            return
        count: int
        if self._redis is not None:
            try:
                bucket = int(time.time() // window_seconds)
                rkey = f"rl:{key}:{bucket}"
                pipe = self._redis.pipeline()
                pipe.incr(rkey)
                pipe.expire(rkey, window_seconds + 1)
                count = int(pipe.execute()[0])
            except redis.RedisError:
                log.warning("rate limiter: redis unavailable, using in-process fallback")
                count = self._hit_local(key, window_seconds)
        else:
            count = self._hit_local(key, window_seconds)
        if count > limit:
            raise RateLimited("Too many requests. Please slow down and try again shortly.",
                              details={"limit": limit, "window_seconds": window_seconds})

    def ping(self) -> bool:
        if self._redis is None:
            return False
        try:
            return bool(self._redis.ping())
        except redis.RedisError:
            return False

    def reset_local(self) -> None:
        with self._lock:
            self._local.clear()


_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(get_settings().redis_url)
    return _limiter
