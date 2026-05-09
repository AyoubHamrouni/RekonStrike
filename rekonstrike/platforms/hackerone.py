"""HackerOne API client — programs and scope retrieval."""

import aiohttp
from .base import PlatformClient


class HackerOneClient(PlatformClient):
    BASE = "https://api.hackerone.com/v1"

    @property
    def platform_name(self) -> str:
        return "hackerone"

    def _auth(self) -> aiohttp.BasicAuth:
        parts = self.api_key.split(":", 1)
        username = parts[0] if len(parts) > 1 else self.api_key
        token = parts[1] if len(parts) > 1 else ""
        return aiohttp.BasicAuth(username, token)

    async def fetch_programs(self) -> list[dict]:
        programs: list[dict] = []
        async with aiohttp.ClientSession(auth=self._auth()) as session:
            url = f"{self.BASE}/me/programs"
            while url:
                data = await self._request(session, url)
                if not data:
                    break
                for item in data.get("data", []):
                    attrs = item.get("attributes", {})
                    programs.append({
                        "handle": item.get("id", ""),
                        "name": attrs.get("name", ""),
                        "offers_bounties": attrs.get("offers_bounties", False),
                        "state": attrs.get("state", ""),
                    })
                url = None
                links = data.get("links", {})
                next_url = links.get("next") if isinstance(links, dict) else None
                if next_url and next_url != url:
                    url = next_url
        return programs

    async def fetch_scope(self, program_handle: str) -> dict:
        in_scope: list[str] = []
        out_of_scope: list[str] = []
        bounty_min: int | None = None
        bounty_max: int | None = None
        currency: str = "USD"

        async with aiohttp.ClientSession(auth=self._auth()) as session:
            url = f"{self.BASE}/programs/{program_handle}"
            data = await self._request(session, url)
            if not data:
                return _empty_scope()

            attrs = data.get("data", {}).get("attributes", {})
            bounty_min = attrs.get("min_bounty_table")
            bounty_max = attrs.get("max_bounty_table")

            scopes = (
                data.get("data", {})
                .get("relationships", {})
                .get("structured_scopes", {})
                .get("data", [])
            )

            for item in scopes:
                sattrs = item.get("attributes", {})
                asset_type = (sattrs.get("asset_type") or "").upper()
                asset_id = (sattrs.get("asset_identifier") or "").strip()
                instruction = (sattrs.get("instruction") or "").lower()
                if not asset_id:
                    continue
                if asset_type not in ("URL", "WILDCARD", "DOMAIN"):
                    continue
                if instruction == "out_of_scope":
                    out_of_scope.append(asset_id)
                else:
                    in_scope.append(asset_id)

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
