import logging
import os
from typing import Dict

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="",
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

    # Platform and AI key maps (populated from env VARS RS_PLATFORM_KEYS__* and RS_AI_KEYS__*)
    platform_api_keys: Dict[str, str] = Field(default_factory=dict)
    ai_api_keys: Dict[str, str] = Field(default_factory=dict)
    ai_base_urls: Dict[str, str] = Field(default_factory=dict)

    # Limits / paths
    max_subdomains: int = 50000
    data_dir: str = "./data"
    scope_file: str = ""

    # Default platform/program handle (optional)
    platform: str = ""
    program_handle: str = ""

    # DB type hint
    db_type: str = "postgresql"

    # Auth artifacts used by UI / API
    auth_cookie: str = ""
    auth_token: str = ""
    auth_local_storage: str = ""

    # API server auth (empty = no auth required)
    server_api_key: str = ""

    # Tool execution
    tool_concurrency: int = 5
    tool_timeout: int = 300
    tool_mode: str = "native"

    # Browser capture service
    browser_service_url: str = "http://localhost:3001"

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

    def api_key(self, service: str) -> str:
        """Return an API key for a given service by checking platform and AI key maps."""
        svc = service.lower()
        return self.platform_api_keys.get(svc) or self.ai_api_keys.get(svc) or ""

def load_settings() -> Settings:
    # Do not cache to allow tests and runtime to change env vars between calls.
    settings = Settings()

    # Populate dicts from environment variables with specific prefixes so
    # callers can set multiple provider keys via env vars like:
    # RS_PLATFORM_KEYS__HACKERONE=token
    # RS_AI_KEYS__ANTHROPIC=token
    # RS_AI_URLS__ANTHROPIC=https://api.anthropic.com
    for name, val in os.environ.items():
        if not val:
            continue
        if name.startswith("RS_PLATFORM_KEYS__"):
            k = name.split("RS_PLATFORM_KEYS__", 1)[1]
            settings.platform_api_keys[k.lower()] = val
        if name.startswith("RS_AI_KEYS__"):
            k = name.split("RS_AI_KEYS__", 1)[1]
            settings.ai_api_keys[k.lower()] = val
        if name.startswith("RS_AI_URLS__"):
            k = name.split("RS_AI_URLS__", 1)[1]
            settings.ai_base_urls[k.lower()] = val

    # helper functions were converted to methods on Settings for pydantic compatibility

    providers = settings.configured_providers
    if providers:
        logger.info(f"Configured LLM providers: {', '.join(providers)}")
    else:
        logger.warning("No LLM providers configured. Agent features may be limited.")

    # Backward-compatible support for legacy unprefixed env vars used in tests
    # (e.g., DATABASE_URL, AI_PROVIDER). If present, prefer these values.
    if os.environ.get("DATABASE_URL"):
        settings.database_url = os.environ.get("DATABASE_URL")
    if os.environ.get("AI_PROVIDER"):
        settings.ai_provider = os.environ.get("AI_PROVIDER")
    if os.environ.get("DEFAULT_AI_MODEL"):
        settings.default_ai_model = os.environ.get("DEFAULT_AI_MODEL")
    if os.environ.get("ANTHROPIC_API_KEY"):
        settings.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
    if os.environ.get("OPENAI_API_KEY"):
        settings.openai_api_key = os.environ.get("OPENAI_API_KEY")
    if os.environ.get("GOOGLE_API_KEY"):
        settings.google_api_key = os.environ.get("GOOGLE_API_KEY")

    return settings
