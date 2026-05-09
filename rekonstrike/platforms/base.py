"""Abstract base class for bug bounty platform API clients."""

from abc import ABC, abstractmethod


class PlatformClient(ABC):
    def __init__(self, api_key: str):
        self.api_key = api_key

    @property
    @abstractmethod
    def platform_name(self) -> str:
        ...

    @abstractmethod
    async def fetch_programs(self) -> list[dict]:
        ...

    @abstractmethod
    async def fetch_scope(self, program_handle: str) -> dict:
        ...

    async def _request(self, session, url: str, **kwargs) -> dict | list:
        """Make an HTTP request with 429 retry (1 retry, 5s delay)."""
        import asyncio
        import aiohttp

        for attempt in range(2):
            try:
                async with session.get(url, **kwargs) as resp:
                    if resp.status == 429 and attempt == 0:
                        await asyncio.sleep(5)
                        continue
                    if resp.status == 200:
                        ct = resp.content_type or ""
                        if "json" in ct:
                            return await resp.json()
                        text = await resp.text()
                        import json
                        try:
                            return json.loads(text)
                        except json.JSONDecodeError:
                            return {}
                    return {}
            except (aiohttp.ClientError, asyncio.TimeoutError):
                if attempt == 0:
                    await asyncio.sleep(2)
                    continue
                return {}
        return {}
