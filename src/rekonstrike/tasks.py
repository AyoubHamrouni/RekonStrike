"""Task queue — ARQ/Redis for persistent job management with fallback to direct execution."""

import asyncio
import logging
from typing import Optional, Callable

logger = logging.getLogger(__name__)


# ─── ARQ Worker Functions ─────────────────────────────────────────────────────


async def scan_task(
    ctx: dict, target: str, target_type: str, phases: Optional[list[int]] = None
):
    """ARQ worker function: run a scan pipeline."""
    from ..config import Settings
    from ..database import Database
    from ..engine import Pipeline

    settings = Settings(**ctx.get("settings", {}))
    db = Database(settings.database_url)
    # Migration-managed schema expected. Do not call create_all() in production.
    # Ensure migrations have been applied (use `alembic upgrade head`).

    pipeline = Pipeline(settings, db)
    try:
        await pipeline.run(target=target, target_type=target_type, phases=phases)
    finally:
        await db.close()


# ─── Task Manager ──────────────────────────────────────────────────────────────


class TaskManager:
    """Enqueues scan jobs via ARQ/Redis, falls back to direct asyncio tasks in dev."""

    def __init__(self, redis_url: str = "", settings: Optional[dict] = None):
        self.redis_url = redis_url
        self._settings = settings or {}
        self._pool = None
        self._direct_tasks: dict[int, asyncio.Task] = {}

    async def start(self):
        if self.redis_url:
            try:
                from arq.connections import create_pool

                self._pool = await create_pool(self.redis_url)
                logger.info("ARQ connected: %s", self.redis_url)
            except Exception as e:
                logger.warning(
                    "Redis unavailable (%s), falling back to direct execution", e
                )
                self._pool = None

    async def close(self):
        if self._pool:
            await self._pool.close()
        for t in self._direct_tasks.values():
            t.cancel()
        self._direct_tasks.clear()

    async def enqueue_scan(
        self,
        session_id: int,
        target: str,
        target_type: str,
        phases: Optional[list[int]] = None,
        on_event: Optional[Callable] = None,
        settings_dict: Optional[dict] = None,
    ) -> bool:
        """Enqueue a scan. Returns True if queued via ARQ, False if running directly."""
        sd = settings_dict or self._settings
        if self._pool:
            from arq.connections import ArqRedis

            pool: ArqRedis = self._pool
            job = await pool.enqueue_job(
                "scan_task",
                target=target,
                target_type=target_type,
                phases=phases,
                _ctx={"settings": sd},
            )
            if job:
                logger.info("Enqueued scan job %s for %s", job.job_id, target)
                return True

        # Fallback: run directly as asyncio task
        await self._run_direct(session_id, target, target_type, phases, on_event, sd)
        return False

    async def cancel_scan(self, session_id: int) -> bool:
        if self._pool:
            try:
                from arq.connections import ArqRedis

                pool: ArqRedis = self._pool
                jobs = await pool.all_job_results()
                for jr in jobs:
                    if jr.job_id == str(session_id):
                        await jr.abort()
                        return True
            except Exception:
                pass
        task = self._direct_tasks.pop(session_id, None)
        if task:
            task.cancel()
            return True
        return False

    async def _run_direct(
        self,
        session_id: int,
        target: str,
        target_type: str,
        phases: Optional[list[int]],
        on_event: Optional[Callable],
        settings_dict: dict,
    ):
        from ..config import Settings
        from ..database import Database
        from ..engine import Pipeline

        settings = Settings(**settings_dict)
        db = Database(settings.database_url)
        # Migration-managed schema expected. Do not call create_all() in production.
        # Ensure migrations have been applied (use `alembic upgrade head`).

        pipeline = Pipeline(settings, db)

        async def _run():
            try:
                await pipeline.run(
                    target=target,
                    target_type=target_type,
                    phases=phases,
                    event_callback=on_event,
                )
            finally:
                await db.close()
                self._direct_tasks.pop(session_id, None)

        task = asyncio.create_task(_run())
        self._direct_tasks[session_id] = task


# Singleton
_manager: Optional[TaskManager] = None


def get_task_manager(
    redis_url: str = "", settings: Optional[dict] = None
) -> TaskManager:
    global _manager
    if _manager is None:
        _manager = TaskManager(redis_url, settings)
    return _manager
