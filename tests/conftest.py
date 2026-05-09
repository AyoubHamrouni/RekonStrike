"""Test fixtures and configuration."""
import asyncio
import tempfile
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from rekonstrike.config import Settings, load_settings
from rekonstrike.database import Database, Base
from rekonstrike.scope import Scope
from rekonstrike.scoring import Scorer
from rekonstrike.engine import PhaseContext
from rekonstrike.runner import ToolRunner


@pytest.fixture
def temp_db() -> str:
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    yield db_path
    Path(db_path).unlink(missing_ok=True)


@pytest.fixture
def settings(temp_db: str) -> Settings:
    return Settings(db_type="sqlite", db_path=temp_db)


@pytest_asyncio.fixture
async def db(settings: Settings) -> AsyncGenerator[Database, None]:
    database = Database(settings)
    await database.create_all()
    yield database
    await database.close()


@pytest_asyncio.fixture
async def session(db: Database) -> AsyncGenerator[AsyncSession, None]:
    async with await db.get_session() as s:
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
