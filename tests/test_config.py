"""Configuration loading tests."""
import os
import tempfile
from pathlib import Path

import yaml
import pytest

from rekonstrike.config import Settings, load_settings


class TestSettings:
    def test_defaults(self):
        s = Settings()
        assert s.db_type in ("postgresql", "sqlite")
        assert s.tool_mode in ("docker", "native")
        assert s.max_subdomains == 5000

    def test_env_var_override(self):
        os.environ["RS_MAX_SUBDOMAINS"] = "100"
        s = Settings()
        assert s.max_subdomains == 100
        del os.environ["RS_MAX_SUBDOMAINS"]

    def test_db_url_sqlite(self):
        s = Settings(db_type="sqlite", db_path="/tmp/test.db")
        assert "sqlite+aiosqlite" in s.db_connection_url()

    def test_db_url_postgres(self):
        s = Settings(db_type="postgresql", db_url="postgresql+asyncpg://localhost/mydb")
        assert "postgresql+asyncpg" in s.db_connection_url()

    def test_api_key_access(self):
        s = Settings(api_keys={"shodan": "abc123"})
        assert s.api_key("shodan") == "abc123"
        assert s.api_key("nonexistent") == ""

    def test_nested_env_var(self):
        os.environ["RS_API_KEYS__GITHUB"] = "gh_token_xyz"
        s = Settings()
        assert s.api_key("github") == "gh_token_xyz"
        del os.environ["RS_API_KEYS__GITHUB"]


class TestLoadSettings:
    def test_load_from_yaml(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml.dump({"max_subdomains": 250, "tool_mode": "native"}, f)
            yaml_path = f.name
        s = load_settings(yaml_path)
        assert s.max_subdomains == 250
        assert s.tool_mode == "native"
        Path(yaml_path).unlink(missing_ok=True)

    def test_yaml_with_api_keys(self):
        data = {
            "api_keys": {"github": "test_token", "shodan": "shodan_key"},
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml.dump(data, f)
            yaml_path = f.name
        s = load_settings(yaml_path)
        assert s.api_key("github") == "test_token"
        assert s.api_key("shodan") == "shodan_key"
        Path(yaml_path).unlink(missing_ok=True)

    def test_yaml_override_beats_default(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml.dump({"tool_timeout": 999}, f)
            yaml_path = f.name
        s = load_settings(yaml_path)
        assert s.tool_timeout == 999
        Path(yaml_path).unlink(missing_ok=True)
