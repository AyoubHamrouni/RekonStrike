from sqlalchemy.ext.asyncio import AsyncSession
from ..config import Settings
from ..repositories.target_repo import TargetRepository
from ..repositories.session_repo import SessionRepository
from ..tasks import TaskManager
from typing import Optional, Callable


class ScanService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        tm: TaskManager,
        target_repo: TargetRepository,
        session_repo: SessionRepository,
    ):
        self.settings = settings
        self.session = session
        self.tm = tm
        self.target_repo = target_repo
        self.session_repo = session_repo

    async def start_scan(
        self,
        target: str,
        target_type: str,
        phases: Optional[list[int]] = None,
        on_event: Optional[Callable] = None,
    ) -> int:

        async with self.session.begin():
            scope_obj = await self.target_repo.get_or_create_target(target, target_type)
            session = await self.session_repo.create_session(
                target_id=scope_obj.id,
                workflow=target_type,
                config_snapshot=self.settings.model_dump(mode="json"),
            )
            session_id = session.id

        # Initiate background task
        settings_dict = self.settings.model_dump(mode="json")
        await self.tm.enqueue_scan(
            session_id=session_id,
            target=target,
            target_type=target_type,
            phases=phases,
            on_event=on_event,
            settings_dict=settings_dict,
        )

        return session_id

    async def cancel_scan(self, session_id: int) -> bool:
        cancelled = await self.tm.cancel_scan(session_id)
        if cancelled:
            async with self.session.begin():
                await self.session_repo.update_status(session_id, "cancelled")
        return cancelled
