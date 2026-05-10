import logging
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/rekonstrike"

    # LLM Provider Keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # Defaults for Agent logic
    ai_provider: str = "openai"
    default_ai_model: str = "gpt-4o-mini"

    # Redis (optional — falls back to direct execution if unavailable)
    redis_url: str = ""

    # API server auth (empty = no auth required)
    server_api_key: str = ""

    # Tool execution
    tool_concurrency: int = 5
    tool_timeout: int = 300
    tool_mode: str = "native"

    @property
    def configured_providers(self) -> list[str]:
        providers = []
        if self.anthropic_api_key:
            providers.append("anthropic")
        if self.openai_api_key:
            providers.append("openai")
        if self.google_api_key:
            providers.append("google")
        return providers

def load_settings() -> Settings:
    settings = Settings()

    providers = settings.configured_providers
    if providers:
        logger.info(f"Configured LLM providers: {', '.join(providers)}")
    else:
        logger.warning("No LLM providers configured. Agent features may be limited.")

    return settings
