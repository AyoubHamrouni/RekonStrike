"""Phase pipeline engine — decorator-based plugin registry with async execution"""
import asyncio
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .database import Database
from .output import out
from .scope import Scope
from .runner import ToolRunner
from .repositories.target_repo import TargetRepository
from .repositories.session_repo import SessionRepository


# ─── Phase Registry ───────────────────────────────────────────────────────────

_phase_registry: dict[int, dict] = {}


def phase(number: int, name: str, description: str = ""):
    """Decorator to register a phase class in the pipeline."""
    def decorator(cls):
        _phase_registry[number] = {
            "number": number,
            "name": name,
            "description": description,
            "class": cls,
        }
        return cls
    return decorator


def get_registered_phases() -> list[dict]:
    return [_phase_registry[n] for n in sorted(_phase_registry)]


# ─── Context ──────────────────────────────────────────────────────────────────

@dataclass
class PhaseContext:
    target: str
    target_type: str  # wildcard | domain | company | url
    settings: Settings
    db: Database
    scope: Scope
    runner: ToolRunner
    session_id: int
    target_id: int
    db_session: AsyncSession
    event_callbacks: list[Callable] = field(default_factory=list)

    # Data flowing between phases
    subdomains: set[str] = field(default_factory=set)
    live_hosts: list[dict] = field(default_factory=list)
    wordlists: dict[str, Path] = field(default_factory=dict)

    async def emit(self, event: str, data: dict):
        for cb in self.event_callbacks:
            await cb(event, data)


# ─── Pipeline ─────────────────────────────────────────────────────────────────

class Pipeline:
    def __init__(self, settings: Settings, db: Database):
        self.settings = settings
        self.db = db

    async def run(self, target: str, target_type: str = "wildcard",
                  phases: Optional[list[int]] = None,
                  event_callback: Optional[Callable] = None) -> PhaseContext:
        out.banner()
        out.info(f"Target: [bold]{target}[/bold]   Type: [bold]{target_type}[/bold]")

        scope = Scope.from_target(target, target_type)
        runner = ToolRunner(self.settings)

        async with await self.db.get_session() as s:
            target_repo = TargetRepository(s)
            session_repo = SessionRepository(s)
            
            async with s.begin():
                scope_obj = await target_repo.get_or_create_target(target, target_type)
                session_id = (await session_repo.create_session(
                    target_id=scope_obj.id,
                    workflow=target_type,
                    config_snapshot=self.settings.model_dump(mode="json")
                )).id
                target_id = scope_obj.id

        ctx = PhaseContext(
            target=target, target_type=target_type,
            settings=self.settings, db=self.db,
            scope=scope, runner=runner,
            session_id=session_id, target_id=target_id,
            db_session=None,
        )
        from .wordlists import WORDLISTS as _wl
        ctx.wordlists = _wl
        if event_callback:
            ctx.event_callbacks.append(event_callback)

        all_phases = get_registered_phases()
        selected = [p for p in all_phases if phases is None or p["number"] in phases]

        for phase_def in selected:
            num, name, desc = phase_def["number"], phase_def["name"], phase_def["description"]
            out.phase(num, name, desc)

            await ctx.emit("phase_start", {"phase": num, "name": name})

            start = time.monotonic()
            try:
                phase_instance = phase_def["class"](ctx)
                if asyncio.iscoroutinefunction(phase_instance.run):
                    await phase_instance.run()
                else:
                    phase_instance.run()

                elapsed = time.monotonic() - start
                out.success(f"Phase {num} complete ({elapsed:.1f}s)")

                await ctx.emit("phase_complete", {
                    "phase": num, "name": name, "elapsed": elapsed,
                })

            except Exception as e:
                elapsed = time.monotonic() - start
                out.error(f"Phase {num} failed after {elapsed:.1f}s: {e}")
                await ctx.emit("phase_error", {
                    "phase": num, "name": name, "error": str(e), "elapsed": elapsed,
                })
                async with await self.db.get_session() as s:
                    async with s.begin():
                        await SessionRepository(s).update_status(session_id, "failed", str(e))
                raise

        async with await self.db.get_session() as s:
            async with s.begin():
                await SessionRepository(s).update_status(session_id, "completed")
                
        await ctx.emit("scan_complete", {})
        out.divider()
        out.success(f"Scan complete for [bold]{target}[/bold]")
        self._summary(ctx)
        return ctx


    def _summary(self, ctx: PhaseContext):
        out.phase(99, "Summary")
        out.table("Results", ["Metric", "Count"], [
            ["Subdomains", str(len(ctx.subdomains))],
            ["Live Hosts", str(len(ctx.live_hosts))],
        ])
