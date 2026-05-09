from typing import Optional
from ..config import Settings
from ..database import Database
from ..repositories.target_repo import TargetRepository
from ..repositories.session_repo import SessionRepository
from ..tasks import TaskManager
from typing import Optional, Callable

class ScanService:
    def __init__(self, settings: Settings, db: Database, tm: TaskManager):
        self.settings = settings
        self.db = db
        self.tm = tm

    async def start_scan(self, target: str, target_type: str, 
                         phases: Optional[list[int]] = None,
                         on_event: Optional[Callable] = None) -> int:
        async with await self.db.get_session() as s:
            target_repo = TargetRepository(s)
            session_repo = SessionRepository(s)
            
            async with s.begin():
                scope_obj = await target_repo.get_or_create_target(target, target_type)
                session = await session_repo.create_session(
                    target_id=scope_obj.id,
                    workflow=target_type,
                    config_snapshot=self.settings.model_dump(mode="json")
                )
                session_id = session.id

        # Initiate background task
        # We pass the settings dict as required by our previous fix
        settings_dict = self.settings.model_dump(mode="json")
        await self.tm.enqueue_scan(
            session_id=session_id,
            target=target,
            target_type=target_type,
            phases=phases,
            on_event=on_event,
            settings_dict=settings_dict
        )
        
        return session_id

    async def cancel_scan(self, session_id: int) -> bool:
        cancelled = await self.tm.cancel_scan(session_id)
        if cancelled:
            async with await self.db.get_session() as s:
                async with s.begin():
                    session_repo = SessionRepository(s)
                    await session_repo.update_status(session_id, "cancelled")
        return cancelled
