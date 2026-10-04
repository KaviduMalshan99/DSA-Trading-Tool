"""
Fixed-window rate limiter on Redis (INCR + EXPIRE).

Fails open: if Redis is unavailable or errors, the request is allowed and a
warning is logged — the app keeps running without Redis, as everywhere else.
"""
import logging

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

_PREFIX = "ratelimit:"


async def hit(key: str, limit: int, window_seconds: int) -> bool:
    """Count one attempt against `key`; return False once more than `limit`
    attempts fall in the current window."""
    try:
        r = await get_redis()
        redis_key = _PREFIX + key
        count = await r.incr(redis_key)
        if count == 1:
            await r.expire(redis_key, window_seconds)
        elif await r.ttl(redis_key) == -1:
            # A previous EXPIRE was lost (crash between the two calls): without
            # this the key would never reset and lock the user out for good.
            await r.expire(redis_key, window_seconds)
    except Exception as exc:  # noqa: BLE001 — any Redis failure means fail open
        logger.warning("Rate limiter unavailable, allowing request (%s: %s)", type(exc).__name__, exc)
        return True
    return count <= limit
