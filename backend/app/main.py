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
from app.api.auth import router as auth_router
from app.api.candles import router as candles_router
from app.api.symbols import router as symbols_router
from app.api.indicators import router as indicators_router
from app.websocket.candle_stream import router as candle_stream_router
from app.websocket.delta_stream import router as delta_stream_router
from app.websocket.footprint_stream import router as footprint_stream_router
from app.websocket.volume_profile_stream import router as vprofile_stream_router
from app.websocket.whale_stream import router as whale_stream_router
from app.websocket.heatmap_stream import router as heatmap_stream_router
from app.websocket.dom_stream import router as dom_stream_router
from app.websocket.tape_stream import router as tape_stream_router
from app.websocket.routes import router as ws_router

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
app.include_router(candles_router, prefix="/api/v1")
app.include_router(symbols_router, prefix="/api/v1")
app.include_router(indicators_router, prefix="/api/v1")
app.include_router(candle_stream_router)    # specific routes before the catch-all
app.include_router(delta_stream_router)
app.include_router(footprint_stream_router)
app.include_router(vprofile_stream_router)
app.include_router(whale_stream_router)
app.include_router(heatmap_stream_router)
app.include_router(dom_stream_router)
app.include_router(tape_stream_router)
app.include_router(ws_router)


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
