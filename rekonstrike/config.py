"""Configuration management — YAML with env var override, Pydantic validated"""
from pathlib import Path
from typing import Literal, Optional

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RS_",
        env_nested_delimiter="__",
        extra="ignore",
    )

    # Database
    db_type: Literal["postgresql", "sqlite"] = "postgresql"
    db_path: str = "data/rekonstrike.db"
    db_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/rekonstrike"
    db_pool_size: int = 20
    db_max_overflow: int = 10

    # Redis (task queue)
    redis_url: str = "redis://localhost:6379/0"

    # Tool execution
    tool_mode: Literal["docker", "native"] = "native"
    tool_timeout: int = 600
    tool_concurrency: int = 20
    tool_rate_limit: int = 10

    # Scan defaults
    max_subdomains: int = 5000
    max_live_servers: int = 500
    auto_screenshots: bool = True
    auto_metadata: bool = True

    # API Keys (overridable via RS_API_KEYS__SHODAN=xxx)
    api_keys: dict[str, str] = Field(default_factory=lambda: {
        "github": "", "shodan": "", "securitytrails": "",
        "censys": "", "hackerone": "", "whoisxmlapi": "",
    })

    # Server API key for web API authentication (empty = no auth)
    server_api_key: str = ""

    # Paths
    go_bin: str = "~/go/bin"
    wordlist_dir: str = "wordlists"
    data_dir: str = "data"

    def db_connection_url(self) -> str:
        if self.db_type == "sqlite":
            return f"sqlite+aiosqlite:///{self.db_path}"
        return self.db_url

    def api_key(self, name: str) -> str:
        return self.api_keys.get(name, "") or ""


def load_settings(path: Optional[str] = None) -> Settings:
    kwargs = {}
    if path and Path(path).exists():
        with open(path) as f:
            yaml_data = yaml.safe_load(f) or {}
        kwargs.update(yaml_data)
    # Default config for fallback
    if not kwargs:
        root = Path(__file__).parent.parent / "config.yaml"
        if root.exists():
            with open(root) as f:
                yaml_data = yaml.safe_load(f) or {}
            kwargs.update(yaml_data)
    return Settings(**kwargs)
