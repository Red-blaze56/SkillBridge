from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    debug: bool = True

    frontend_url: str
    database_url: str
    secret_key: str
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cookie_secure: bool = True                                # secure by default; set COOKIE_SECURE=false in local .env for non-HTTPS
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    llm_api_key: str
    llm_model: str = "gemini-2.5-flash"
    llm_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"

    @model_validator(mode="after")
    def _samesite_none_needs_secure(self):
        # Browsers reject SameSite=None cookies that aren't Secure; fail fast instead.
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("cookie_samesite='none' requires cookie_secure=True")
        return self


settings = Settings()  # type: ignore[call-arg]
