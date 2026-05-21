from __future__ import annotations

from functools import lru_cache
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from urllib.parse import urlparse
import re


class Base(DeclarativeBase):
    pass


def normalize_host(raw: str) -> str:
    if not raw:
        return ""
    raw = raw.strip()
    if not re.match(r"^[a-zA-Z]+://", raw):
        raw_for_parse = "//" + raw
    else:
        raw_for_parse = raw
    parsed = urlparse(raw_for_parse)
    host = parsed.hostname or ""
    port = parsed.port
    host = host.lower()
    if port and port not in (80, 443):
        return f"{host}:{port}"
    return host


class Database:
    def __init__(self, url: str):
        self.engine = create_async_engine(url)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def create_all(self):
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    def get_session(self) -> AsyncSession:
        return self.session_factory()

    async def close(self):
        await self.engine.dispose()


@lru_cache(maxsize=2)
def get_database(url: str | None = None) -> Database:
    from ..config import load_settings

    if not url:
        url = load_settings().database_url
    return Database(url)


__all__ = [
    "Base", "Database", "get_database", "normalize_host",
]
