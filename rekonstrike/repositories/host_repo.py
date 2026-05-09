from typing import Optional, Sequence, Any
from sqlalchemy import select, func, insert
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import LiveHost, Endpoint, Vulnerability, Subdomain


class HostRepository:
    def __init__(self, session: AsyncSession, db_type: str = "sqlite"):
        self.session = session
        self.db_type = db_type

    async def add_live_hosts(self, rows: list[dict[str, Any]]):
        if not rows:
            return

        stmt = insert(LiveHost)
        if self.db_type == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = (
                pg_insert(LiveHost)
                .values(rows)
                .on_conflict_do_nothing(index_elements=["url"])
            )
        else:
            stmt = stmt.values(rows).prefix_with("OR IGNORE")

        await self.session.execute(stmt)

    async def get_live_hosts(
        self, target_id: int, page: int = 0, size: int = 50
    ) -> tuple[Sequence[LiveHost], int]:
        stmt = select(LiveHost).join(Subdomain).where(Subdomain.target_id == target_id)

        count_stmt = (
            select(func.count())
            .select_from(LiveHost)
            .join(Subdomain)
            .where(Subdomain.target_id == target_id)
        )
        total = (await self.session.execute(count_stmt)).scalar() or 0

        stmt = stmt.order_by(LiveHost.roi_score.desc()).offset(page * size).limit(size)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

    async def get_vulnerabilities(
        self,
        target_id: int,
        severity: Optional[str] = None,
        page: int = 0,
        size: int = 50,
    ) -> tuple[Sequence[Vulnerability], int]:
        stmt = (
            select(Vulnerability)
            .join(LiveHost)
            .join(Subdomain)
            .where(Subdomain.target_id == target_id)
        )

        count_stmt = (
            select(func.count())
            .select_from(Vulnerability)
            .join(LiveHost)
            .join(Subdomain)
            .where(Subdomain.target_id == target_id)
        )
        if severity:
            stmt = stmt.where(Vulnerability.severity == severity)
            count_stmt = count_stmt.where(Vulnerability.severity == severity)

        total = (await self.session.execute(count_stmt)).scalar() or 0
        stmt = (
            stmt.order_by(Vulnerability.severity.desc()).offset(page * size).limit(size)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all(), total
