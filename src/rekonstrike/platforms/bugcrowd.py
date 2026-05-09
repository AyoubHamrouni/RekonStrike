"""Bugcrowd API client — programs and scope retrieval."""

import aiohttp
from .base import PlatformClient


class BugcrowdClient(PlatformClient):
    BASE = "https://api.bugcrowd.com"

    @property
    def platform_name(self) -> str:
        return "bugcrowd"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    async def fetch_programs(self) -> list[dict]:
        programs: list[dict] = []
        async with aiohttp.ClientSession(headers=self._headers()) as session:
            url = f"{self.BASE}/programs"
            while url:
                data = await self._request(session, url)
                if not data:
                    break
                for item in data.get("data", []):
                    attrs = item.get("attributes", {})
                    programs.append(
                        {
                            "handle": item.get("id", ""),
                            "name": attrs.get("name", ""),
                            "offers_bounties": attrs.get("bounty", False),
                            "state": attrs.get("state", ""),
                        }
                    )
                links = data.get("links", {})
                url = links.get("next") if isinstance(links, dict) else None
        return programs

    async def fetch_scope(self, program_handle: str) -> dict:
        in_scope: list[str] = []
        out_of_scope: list[str] = []
        bounty_min: int | None = None
        bounty_max: int | None = None
        currency: str = "USD"

        async with aiohttp.ClientSession(headers=self._headers()) as session:
            url = f"{self.BASE}/programs/{program_handle}/scopes"
            data = await self._request(session, url)
            if not data:
                return _empty_scope()

            targets = data.get("targets", {}) if isinstance(data, dict) else {}
            for entry in targets.get("in_scope", []):
                target_val = (entry.get("target") or "").strip()
                if target_val:
                    in_scope.append(target_val)
            for entry in targets.get("out_of_scope", []):
                target_val = (entry.get("target") or "").strip()
                if target_val:
                    out_of_scope.append(target_val)

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
        "currency": "USD",
    }
