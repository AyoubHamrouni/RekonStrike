"""Configuration loading tests."""
import os

from rekonstrike.config import Settings, load_settings


class TestSettings:
    def test_defaults(self):
        s = Settings()
        assert "postgresql+asyncpg" in s.database_url
        assert s.ai_provider == "openai"
        assert s.default_ai_model == "gpt-4o-mini"

    def test_env_var_override(self):
        os.environ["DATABASE_URL"] = "postgresql+asyncpg://localhost:5432/other"
        s = Settings()
        assert s.database_url == "postgresql+asyncpg://localhost:5432/other"
        del os.environ["DATABASE_URL"]

    def test_db_url_postgres(self):
        s = Settings(database_url="postgresql+asyncpg://localhost/mydb")
        assert "postgresql+asyncpg" in s.database_url

    def test_anthropic_key(self):
        s = Settings(anthropic_api_key="sk-ant-abc123")
        assert s.anthropic_api_key == "sk-ant-abc123"
        assert "anthropic" in s.configured_providers

    def test_openai_key(self):
        s = Settings(openai_api_key="sk-proj-xyz")
        assert s.openai_api_key == "sk-proj-xyz"
        assert "openai" in s.configured_providers

    def test_multiple_providers(self):
        s = Settings(anthropic_api_key="a", openai_api_key="b")
        assert len(s.configured_providers) == 2

    def test_no_providers(self):
        s = Settings()
        assert s.configured_providers == []


class TestLoadSettings:
    def test_basic_load(self):
        s = load_settings()
        assert isinstance(s, Settings)

    def test_env_override(self):
        os.environ["AI_PROVIDER"] = "anthropic"
        s = load_settings()
        assert s.ai_provider == "anthropic"
        del os.environ["AI_PROVIDER"]
