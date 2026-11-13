import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.database import init_db
from app.core.config import settings
from app.core.redis import close_redis
from app.models import candle as _candle_model  # noqa: F401 — registers CandleRecord with Base
from app.models import user as _user_model  # noqa: F401 — registers User with Base
from app.models import user_data as _user_data_model  # noqa: F401 — registers UserData with Base
from app.api.auth import router as auth_router
from app.api.symbols import router as symbols_router
from app.api.sync import router as sync_router
from app.websocket.candle_stream import router as candle_stream_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        logger.info("Database connected and tables initialised.")
    except Exception as exc:
        logger.warning("Database unavailable — running without DB. (%s)", exc)

    try:
        from app.core.redis import get_redis
        await get_redis()
        logger.info("Redis connected.")
    except Exception as exc:
        logger.warning("Redis unavailable — running without Redis. (%s)", exc)

    yield

    try:
        await close_redis()
    except Exception:
        pass


app = FastAPI(
    title="Check Your Chart API",
    version="1.0.0",
    lifespan=lifespan,
)

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


# CSRF defence for cookie auth: reject state-changing API calls from foreign origins.
# A missing Origin is allowed (curl, server-to-server webhooks). Registered before
# CORSMiddleware so CORS stays outermost and the 403 still carries CORS headers.
@app.middleware("http")
async def check_origin(request: Request, call_next):
    if request.method in _UNSAFE_METHODS and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin is not None and origin not in settings.cors_origins:
            return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(symbols_router, prefix="/api/v1")
app.include_router(sync_router, prefix="/api/v1")
app.include_router(candle_stream_router)


@app.get("/health")
async def health():
    db_ok = False
    redis_ok = False

    try:
        from app.core.database import engine
        async with engine.connect():
            db_ok = True
    except Exception:
        pass

    try:
        from app.core.redis import get_redis
        r = await get_redis()
        await r.ping()
        redis_ok = True
    except Exception:
        pass

    return {
        "status": "ok",
        "database": "connected" if db_ok else "unavailable",
        "redis": "connected" if redis_ok else "unavailable",
    }
