"""Intigriti API client — programs and scope retrieval."""

import aiohttp
from .base import PlatformClient


class IntigritiClient(PlatformClient):
    BASE = "https://api.intigriti.com/core/researcher/v2"

    @property
    def platform_name(self) -> str:
        return "intigriti"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    async def fetch_programs(self) -> list[dict]:
        programs: list[dict] = []
        async with aiohttp.ClientSession(headers=self._headers()) as session:
            url = f"{self.BASE}/programs"
            data = await self._request(session, url)
            if not data:
                return programs
            items = data if isinstance(data, list) else data.get("data", [])
            for item in items:
                attrs = item.get("attributes") or item
                program_id = item.get("id") or attrs.get("id", "")
                programs.append({
                    "handle": program_id,
                    "name": attrs.get("name", ""),
                    "offers_bounties": attrs.get("bounty", {}).get("enabled", False),
                    "state": attrs.get("status", ""),
                })
        return programs

    async def fetch_scope(self, program_handle: str) -> dict:
        in_scope: list[str] = []
        out_of_scope: list[str] = []
        bounty_min: int | None = None
        bounty_max: int | None = None
        currency: str = "EUR"

        async with aiohttp.ClientSession(headers=self._headers()) as session:
            url = f"{self.BASE}/programs/{program_handle}/scopes"
            data = await self._request(session, url)
            if not data:
                return _empty_scope()

            for entry in data.get("inScope", []):
                domain = (entry.get("endpoint") or entry.get("domain", "")).strip()
                if domain:
                    in_scope.append(domain)
            for entry in data.get("outOfScope", []):
                domain = (entry.get("endpoint") or entry.get("domain", "")).strip()
                if domain:
                    out_of_scope.append(domain)

        return {
            "in_scope": in_scope,
            "out_of_scope": out_of_scope,
            "bounty_min": bounty_min,
            "bounty_max": bounty_max,
            "currency": currency,
        }


def _empty_scope() -> dict:
    return {
        "in_scope": [],
        "out_of_scope": [],
        "bounty_min": None,
        "bounty_max": None,
        "currency": "EUR",
    }
