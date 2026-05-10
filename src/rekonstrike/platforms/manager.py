"""Platform manager — routes to the right client based on config."""

from ..config import Settings


class PlatformManager:
    def __init__(self, settings: Settings):
        self.settings = settings

    def get_client(self, platform: str):
        api_key = self.settings.platform_api_keys.get(platform, "")
        if not api_key:
            return None
        if platform == "hackerone":
            from .hackerone import HackerOneClient

            return HackerOneClient(api_key)
        if platform == "bugcrowd":
            from .bugcrowd import BugcrowdClient

            return BugcrowdClient(api_key)
        if platform == "intigriti":
            from .intigriti import IntigritiClient

            return IntigritiClient(api_key)
        return None

    async def sync_program_scope(
        self, target_id: int, platform: str, program_handle: str, db
    ) -> dict | None:
        from ..database import ProgramScope
        from sqlalchemy import select

        client = self.get_client(platform)
        if not client:
            return None

        scope = await client.fetch_scope(program_handle)
        if not scope:
            return None

        async with db.get_session() as s:
            async with s.begin():
                existing = await s.execute(
                    select(ProgramScope).where(ProgramScope.target_id == target_id)
                )
                ps = existing.scalar_one_or_none()
                if ps:
                    ps.platform = platform
                    ps.program_handle = program_handle
                    ps.in_scope = scope.get("in_scope", [])
                    ps.out_of_scope = scope.get("out_of_scope", [])
                    ps.bounty_min = scope.get("bounty_min")
                    ps.bounty_max = scope.get("bounty_max")
                    ps.currency = scope.get("currency", "USD")
                else:
                    ps = ProgramScope(
                        target_id=target_id,
                        platform=platform,
                        program_handle=program_handle,
                        in_scope=scope.get("in_scope", []),
                        out_of_scope=scope.get("out_of_scope", []),
                        bounty_min=scope.get("bounty_min"),
                        bounty_max=scope.get("bounty_max"),
                        currency=scope.get("currency", "USD"),
                    )
                    s.add(ps)
                await s.flush()
                return {
                    "id": ps.id,
                    "target_id": ps.target_id,
                    "platform": ps.platform,
                    "program_handle": ps.program_handle,
                    "in_scope_count": len(ps.in_scope or []),
                    "out_of_scope_count": len(ps.out_of_scope or []),
                    "bounty_min": ps.bounty_min,
                    "bounty_max": ps.bounty_max,
                    "currency": ps.currency,
                }

    async def list_programs(self, platform: str) -> list[dict]:
        client = self.get_client(platform)
        if not client:
            return []
        return await client.fetch_programs()
