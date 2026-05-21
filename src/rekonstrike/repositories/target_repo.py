from typing import Optional, Sequence
from sqlalchemy import select, func, insert
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import ScopeTarget, Subdomain


class TargetRepository:
    def __init__(self, session: AsyncSession, user_id: int = 1):
        self.session = session
        self.user_id = user_id

    async def get_or_create_target(self, target: str, target_type: str) -> ScopeTarget:
        result = await self.session.execute(
            select(ScopeTarget).where(
                ScopeTarget.target == target,
                ScopeTarget.user_id == self.user_id,
            )
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            obj = ScopeTarget(target=target, target_type=target_type, user_id=self.user_id)
            self.session.add(obj)
            await self.session.flush()
            await self.session.refresh(obj)
        return obj

    async def get(self, target_id: int) -> Optional[ScopeTarget]:
        result = await self.session.execute(
            select(ScopeTarget).where(
                ScopeTarget.id == target_id,
                ScopeTarget.user_id == self.user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_target_by_id(self, target_id: int) -> Optional[ScopeTarget]:
        return await self.get(target_id)

    async def list_targets(self, limit: int = 100) -> Sequence[ScopeTarget]:
        result = await self.session.execute(
            select(ScopeTarget)
            .where(ScopeTarget.user_id == self.user_id)
            .order_by(ScopeTarget.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def add_subdomains(
        self, target_id: int, subdomains: list[str], source: str = "passive"
    ):
        if not subdomains:
            return

        # Check existing
        existing_rows = await self.session.execute(
            select(Subdomain.subdomain).where(Subdomain.target_id == target_id)
        )
        existing = {r[0] for r in existing_rows.fetchall()}

        new_subs = [
            {"target_id": target_id, "subdomain": s, "source": source}
            for s in subdomains
            if s not in existing
        ]

        if new_subs:
            await self.session.execute(insert(Subdomain).values(new_subs))

    async def get_subdomains(
        self,
        target_id: int,
        resolved: Optional[bool] = None,
        page: int = 0,
        size: int = 100,
    ) -> tuple[Sequence[Subdomain], int]:
        stmt = select(Subdomain).where(Subdomain.target_id == target_id)
        if resolved is not None:
            stmt = stmt.where(Subdomain.resolved == resolved)

        # Count total
        count_stmt = (
            select(func.count())
            .select_from(Subdomain)
            .where(Subdomain.target_id == target_id)
        )
        if resolved is not None:
            count_stmt = count_stmt.where(Subdomain.resolved == resolved)
        total = (await self.session.execute(count_stmt)).scalar() or 0

        # Paginate
        stmt = stmt.order_by(Subdomain.subdomain.asc()).offset(page * size).limit(size)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total
