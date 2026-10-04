"""
Google OAuth 2.0 / OpenID Connect helpers: server-side authorization code flow
with PKCE (S256) and an ID-token nonce.

Never log the client secret, the authorization code or any token — only HTTP
status codes and Google's `error` field.
"""
import base64
import hashlib
import logging
import secrets
from urllib.parse import urlencode

import httpx
import jwt
from starlette.concurrency import run_in_threadpool

from app.core.config import settings

logger = logging.getLogger(__name__)

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_ISSUERS = ("https://accounts.google.com", "accounts.google.com")

# Caches Google's signing keys across requests; refetches on an unknown `kid`.
_jwks_client = jwt.PyJWKClient(JWKS_URL, cache_keys=True)


class GoogleAuthError(Exception):
    pass


def make_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE S256."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def build_authorize_url(state: str, code_challenge: str, nonce: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "nonce": nonce,
        "prompt": "select_account",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(code: str, code_verifier: str) -> str:
    """Exchange an authorization code for the ID token (a JWT string)."""
    data = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(TOKEN_URL, data=data)
    except httpx.HTTPError as exc:
        logger.warning("Google token exchange failed: %s", type(exc).__name__)
        raise GoogleAuthError("token request failed") from exc

    if resp.status_code != 200:
        try:
            error = resp.json().get("error")
        except ValueError:
            error = None
        logger.warning("Google token exchange returned %s (error=%s)", resp.status_code, error)
        raise GoogleAuthError("token exchange rejected")

    try:
        id_token = resp.json().get("id_token")
    except ValueError:
        id_token = None
    if not isinstance(id_token, str) or not id_token:
        logger.warning("Google token response had no id_token")
        raise GoogleAuthError("missing id_token")
    return id_token


async def verify_id_token(id_token: str, expected_nonce: str) -> dict:
    """Verify the ID token's signature and claims; return the claims."""
    try:
        # PyJWKClient may fetch the JWKS over the network (blocking) — keep it off the event loop.
        signing_key = await run_in_threadpool(_jwks_client.get_signing_key_from_jwt, id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,  # tolerate small clock skew on exp/iat
        )
    except jwt.PyJWTError as exc:
        logger.warning("Google ID token rejected: %s", type(exc).__name__)
        raise GoogleAuthError("invalid id_token") from exc

    if claims.get("iss") not in _ISSUERS:
        logger.warning("Google ID token has unexpected issuer")
        raise GoogleAuthError("bad issuer")

    nonce = claims.get("nonce")
    # Compare as bytes: compare_digest raises TypeError on non-ASCII str.
    if not isinstance(nonce, str) or not secrets.compare_digest(nonce.encode(), expected_nonce.encode()):
        logger.warning("Google ID token nonce mismatch")
        raise GoogleAuthError("bad nonce")

    return claims
