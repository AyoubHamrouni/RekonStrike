"""Test fixtures and configuration."""
import os
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from rekonstrike.config import Settings
from rekonstrike.database import Database
from rekonstrike.scope import Scope
from rekonstrike.scoring import Scorer
from rekonstrike.runner import ToolRunner


def _test_db_url() -> str:
    return os.environ.get("TEST_DATABASE_URL", "")


@pytest.fixture
def settings() -> Settings:
    return Settings(database_url=_test_db_url() or "sqlite+aiosqlite:///:memory:")


@pytest_asyncio.fixture
async def db(settings: Settings) -> AsyncGenerator[Database, None]:
    if not _test_db_url():
        pytest.skip("TEST_DATABASE_URL is required for async DB integration tests")
    database = Database(settings.database_url)
    await database.create_all()
    yield database
    await database.close()


@pytest_asyncio.fixture
async def session(db: Database) -> AsyncGenerator[AsyncSession, None]:
    async with db.get_session() as s:
        yield s


@pytest.fixture
def scope_wildcard() -> Scope:
    return Scope.from_target("*.example.com", "wildcard")


@pytest.fixture
def scope_domain() -> Scope:
    return Scope.from_target("example.com", "domain")


@pytest.fixture
def runner(settings: Settings) -> ToolRunner:
    return ToolRunner(settings)


@pytest.fixture
def scorer() -> Scorer:
    return Scorer()
