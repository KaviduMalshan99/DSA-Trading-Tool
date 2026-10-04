from functools import lru_cache
from typing import Literal

from pydantic import model_validator
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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
