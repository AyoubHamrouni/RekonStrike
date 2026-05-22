from typing import Optional, Sequence
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import ScanSession


class SessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_session(
        self, target_id: int, workflow: str, config_snapshot: dict
    ) -> ScanSession:
        scan_sesh = ScanSession(
            target_id=target_id,
            workflow=workflow,
            status="running",
            config_snapshot=config_snapshot,
        )
        self.session.add(scan_sesh)
        await self.session.flush()
        return scan_sesh

    async def update_status(
        self, session_id: int, status: str, error: Optional[str] = None
    ):
        vals = {"status": status}
        if status != "running":
            vals["ended_at"] = func.now()
        if error:
            vals["error_message"] = error

        await self.session.execute(
            update(ScanSession).where(ScanSession.id == session_id).values(**vals)
        )

    async def get_session(self, session_id: int) -> Optional[ScanSession]:
        result = await self.session.execute(
            select(ScanSession).where(ScanSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def list_sessions(self, limit: int = 50) -> Sequence[ScanSession]:
        result = await self.session.execute(
            select(ScanSession).order_by(ScanSession.started_at.desc()).limit(limit)
        )
        return result.scalars().all()

    async def get_sessions_by_target(self, target_id: int, limit: int = 20) -> Sequence[ScanSession]:
        result = await self.session.execute(
            select(ScanSession)
            .where(ScanSession.target_id == target_id)
            .order_by(ScanSession.started_at.desc())
            .limit(limit)
        )
        return result.scalars().all()
