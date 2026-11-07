from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Failover"
    environment: str = Field(default="development", pattern="^(development|test|production)$")
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://failover:failover@localhost:5433/failover"

    jwt_secret: str = "dev-only-change-me-dev-only-change-me-0000"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    reset_token_minutes: int = 30
    cookie_secure: bool = False
    cookie_domain: str | None = None

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    frontend_url: str = "http://localhost:5173"

    max_failed_logins: int = 5
    lockout_minutes: int = 15

    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    ai_daily_limit: int = 40
    ai_timeout_s: float = 60.0

    interview_minutes: int = 45

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.deepseek_api_key)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production and (s.jwt_secret.startswith("dev-only") or len(s.jwt_secret) < 32):
        raise RuntimeError("JWT_SECRET must be set to a strong random value in production")
    return s
