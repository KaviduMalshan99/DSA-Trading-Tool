import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import init_db
from app.core.redis import close_redis
from app.models import candle as _candle_model  # noqa: F401 — registers CandleRecord with Base
from app.api.candles import router as candles_router
from app.api.symbols import router as symbols_router
from app.api.indicators import router as indicators_router
from app.websocket.candle_stream import router as candle_stream_router
from app.websocket.delta_stream import router as delta_stream_router
from app.websocket.footprint_stream import router as footprint_stream_router
from app.websocket.volume_profile_stream import router as vprofile_stream_router
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
    title="DSA Trading Tool API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(candles_router, prefix="/api/v1")
app.include_router(symbols_router, prefix="/api/v1")
app.include_router(indicators_router, prefix="/api/v1")
app.include_router(candle_stream_router)    # specific routes before the catch-all
app.include_router(delta_stream_router)
app.include_router(footprint_stream_router)
app.include_router(vprofile_stream_router)
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
