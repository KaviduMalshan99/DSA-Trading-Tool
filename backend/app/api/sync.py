"""
Account sync (Stage 4): the frontend mirrors an allowlisted set of localStorage
entries to the logged-in user's account. Values are opaque strings — stored and
returned exactly as sent, never parsed.

Concurrency is optimistic: each row carries a version. An item with
base_version null is an insert (conflict if the row exists); base_version N is
an update that only applies while the row is still at version N.
"""
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _NoStoreRoute
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.user_data import UserData

# ── Allowlist (mirrored exactly in frontend/src/services/persist.ts) ──────────

SYNC_KEYS = frozenset({
    "dsa-watchlist",
    "dsa-watchlist-tags",
    "dsa-timezone",
    "dsa-theme",
    "dsa-candle-style",
    "dsa-indicator-config",
    "dsa-fav-intervals",
    "dsa-fav-indicators",
    "dsa-position-calc",
    "dsa-alerts",
})
SYNC_KEY_PATTERN = re.compile(r"^dsa_drawings_[A-Za-z0-9._-]{1,40}_[A-Za-z0-9]{1,8}$")


def is_synced_key(key: str) -> bool:
    # fullmatch: `$` alone would also accept a trailing newline.
    return key in SYNC_KEYS or SYNC_KEY_PATTERN.fullmatch(key) is not None


# ── Limits ────────────────────────────────────────────────────────────────────

MAX_BODY_BYTES = 6 * 1024 * 1024
MAX_VALUE_CHARS = 1_000_000
MAX_BATCH_ITEMS = 100
MAX_USER_TOTAL_CHARS = 5_000_000
MAX_USER_KEYS = 500


def _now_ms() -> int:
    return int(time.time() * 1000)


def _too_large(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=detail)


# ── Schemas ───────────────────────────────────────────────────────────────────

class SyncItemOut(BaseModel):
    key: str
    value: str
    version: int
    updated_at: int


class SyncListOut(BaseModel):
    items: list[SyncItemOut]


class BatchItemIn(BaseModel):
    key: str
    value: str
    base_version: int | None


class BatchIn(BaseModel):
    items: list[BatchItemIn]


class BatchResultOut(BaseModel):
    key: str
    status: str  # 'ok' | 'conflict'
    version: int | None  # on conflict: the current server version, null if the row is missing
    updated_at: int | None


class BatchOut(BaseModel):
    results: list[BatchResultOut]


async def _read_batch_body(request: Request) -> BatchIn:
    """Parse the batch body with a hard size cap. Content-Length is checked up front,
    but it can be absent (chunked) or wrong, so the streamed byte count is enforced too."""
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > MAX_BODY_BYTES:
                raise _too_large("Request body too large")
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length")

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            raise _too_large("Request body too large")
        chunks.append(chunk)

    try:
        return BatchIn.model_validate_json(b"".join(chunks))
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_url=False))


def _validate_batch(items: list[BatchItemIn]) -> None:
    if len(items) > MAX_BATCH_ITEMS:
        raise _too_large(f"Too many items in batch (max {MAX_BATCH_ITEMS})")
    seen: set[str] = set()
    for item in items:
        if not is_synced_key(item.key):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Key not allowed: {item.key[:80]!r}")
        if item.key in seen:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Duplicate key in batch: {item.key!r}")
        seen.add(item.key)
        if len(item.value) > MAX_VALUE_CHARS:
            raise _too_large(f"Value too large for {item.key!r} (max {MAX_VALUE_CHARS} characters)")


router = APIRouter(prefix="/sync", tags=["sync"], route_class=_NoStoreRoute)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=SyncListOut)
async def list_items(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(UserData).where(UserData.user_id == user.id).order_by(UserData.key))
    return SyncListOut(items=[
        SyncItemOut(key=r.key, value=r.value, version=r.version, updated_at=r.updated_at) for r in rows
    ])


@router.post("/batch", response_model=BatchOut)
async def batch(
    # user before body: dependencies resolve in order, so an anonymous caller gets
    # 401 without the server reading their (up to 6 MB) body first.
    user: User = Depends(get_current_user),
    body: BatchIn = Depends(_read_batch_body),
    db: AsyncSession = Depends(get_db),
):
    _validate_batch(body.items)

    # Lock the user's row so concurrent batches for the same user serialise: the
    # quota check below and the versioned writes then see a consistent picture.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())

    # Quota, counting the batch as if every item were written (conflicts included —
    # conservative, and keeps the check independent of write outcomes).
    existing = await db.execute(
        select(UserData.key, func.length(UserData.value)).where(UserData.user_id == user.id)
    )
    lengths: dict[str, int] = {key: length for key, length in existing}
    for item in body.items:
        lengths[item.key] = len(item.value)
    if len(lengths) > MAX_USER_KEYS:
        await db.rollback()
        raise _too_large(f"Sync storage limit reached: at most {MAX_USER_KEYS} keys per account")
    if sum(lengths.values()) > MAX_USER_TOTAL_CHARS:
        await db.rollback()
        raise _too_large(f"Sync storage limit reached: at most {MAX_USER_TOTAL_CHARS} characters per account")

    now = _now_ms()
    results: list[BatchResultOut] = []
    for item in body.items:
        if item.base_version is None:
            stmt = (
                insert(UserData)
                .values(user_id=user.id, key=item.key, value=item.value, version=1, updated_at=now)
                .on_conflict_do_nothing(index_elements=[UserData.user_id, UserData.key])
                .returning(UserData.version, UserData.updated_at)
            )
        else:
            stmt = (
                update(UserData)
                .where(
                    UserData.user_id == user.id,
                    UserData.key == item.key,
                    UserData.version == item.base_version,
                )
                .values(value=item.value, version=UserData.version + 1, updated_at=now)
                .returning(UserData.version, UserData.updated_at)
            )
        written = (await db.execute(stmt)).first()
        if written is not None:
            results.append(BatchResultOut(key=item.key, status="ok", version=written[0], updated_at=written[1]))
            continue

        current = (await db.execute(
            select(UserData.version, UserData.updated_at)
            .where(UserData.user_id == user.id, UserData.key == item.key)
        )).first()
        results.append(BatchResultOut(
            key=item.key,
            status="conflict",
            version=current[0] if current else None,
            updated_at=current[1] if current else None,
        ))

    await db.commit()
    return BatchOut(results=results)
