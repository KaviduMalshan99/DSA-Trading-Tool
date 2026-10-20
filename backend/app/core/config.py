from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "DSA Trading Tool"
    debug: bool = False
    environment: str = "development"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dsa_trading"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Binance
    binance_api_key: str = ""
    binance_api_secret: str = ""
    binance_ws_url: str = "wss://stream.binance.com:9443/ws"
    binance_rest_url: str = "https://api.binance.com"

    # Forex (e.g., Alpha Vantage)
    forex_api_key: str = ""

    # Stocks (e.g., Polygon.io)
    stocks_api_key: str = ""

    # WebSocket
    ws_heartbeat_interval: int = 30

    # Auth — jwt_secret has no default on purpose: the app must refuse to start without one.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # Session cookie — set COOKIE_SECURE=false only for local http dev.
    cookie_name: str = "cyc_session"
    cookie_secure: bool = True
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None

    # Google OAuth — optional; Google login is disabled unless all three google_* are set.
    google_client_id: str = ""
    google_client_secret: str = ""
    # Full callback URL. Never derived from the request: prod sits behind Cloudflare + a proxy.
    google_redirect_uri: str = ""
    # Where the browser lands after the OAuth callback (no trailing slash).
    frontend_url: str = "http://localhost:5173"

    # Subscription — all server-driven; /auth/me hands them to the UI.
    subscription_price_lkr: Decimal = Decimal("1000.00")  # exactly 2 decimal places, > 0
    subscription_days: int = Field(default=30, gt=0)  # access bought per payment
    trial_days: int = Field(default=7, gt=0)  # free trial for new accounts (migration 004 hard-codes 7 for existing ones)
    banner_days: int = Field(default=3, ge=0)  # show the "ends in N days" banner this close to the end
    max_prepaid_days: int = Field(default=90, gt=0)  # refuse checkout once access already runs this far ahead

    # OnePay — optional; payments stay disabled unless app id, token, salt and return base URL are all set.
    onepay_app_id: str = ""
    onepay_app_token: str = ""
    onepay_hash_salt: str = ""
    onepay_base_url: str = "https://api.onepay.lk/v3"
    # Public HTTPS base of this API (no trailing slash); OnePay sends the browser back to
    # {base}/api/v1/payments/return/{reference}. Prod: https://checkyourchart.net
    onepay_return_base_url: str = ""

    # CORS
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://checkyourchart.net",
    ]

    class Config:
        env_file = ".env"

    @model_validator(mode="after")
    def _check_cookie_flags(self) -> "Settings":
        # Browsers reject SameSite=None cookies that aren't also Secure.
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
        return self

    @field_validator("subscription_price_lkr")
    @classmethod
    def _check_price(cls, v: Decimal) -> Decimal:
        if not v.is_finite() or v <= 0:
            raise ValueError("SUBSCRIPTION_PRICE_LKR must be greater than 0")
        if v != v.quantize(Decimal("0.01")):
            raise ValueError("SUBSCRIPTION_PRICE_LKR must have at most 2 decimal places")
        return v.quantize(Decimal("0.01"))

    @field_validator("onepay_return_base_url")
    @classmethod
    def _check_return_base_url(cls, v: str) -> str:
        v = v.strip().rstrip("/")
        if v and not v.startswith("https://"):
            raise ValueError("ONEPAY_RETURN_BASE_URL must start with https://")
        return v

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.google_redirect_uri)

    @property
    def onepay_enabled(self) -> bool:
        return bool(
            self.onepay_app_id and self.onepay_app_token and self.onepay_hash_salt and self.onepay_return_base_url
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
