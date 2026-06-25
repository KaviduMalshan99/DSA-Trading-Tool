from pydantic_settings import BaseSettings
from functools import lru_cache


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

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
