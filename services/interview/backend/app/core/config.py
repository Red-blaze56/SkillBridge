from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    debug: bool = False  # True logs every SQL statement

    database_url: str

    # Shared secret between SkillBridge's API and this service. Only SkillBridge's API
    # knows it, so only SkillBridge's API can call this service.
    service_token: str = Field(min_length=32)

    llm_api_key: str = ""  # empty: interview turns fail with a clear "check LLM_API_KEY" message
    llm_model: str = "gemini-2.5-flash"
    llm_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"


settings = Settings()  # type: ignore[call-arg]
