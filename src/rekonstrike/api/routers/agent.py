import asyncio
import json
import logging
import time
from typing import Optional, Dict, List, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..deps import verify_auth, get_target_repo, get_agent_runner, get_session_repo
from ...database import get_database
from ...repositories.target_repo import TargetRepository
from ...repositories.session_repo import SessionRepository
from ...agent.runner import ReconAgentRunner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/targets/{target_id}/agent", tags=["agent"])


# ── Session Manager ──────────────────────────────────────────────────────────


class AgentSession:
    def __init__(self, session_id: int, target_id: int, target_domain: str):
        self.session_id: int = session_id
        self.target_id: int = target_id
        self.target_domain: str = target_domain
        self.status: str = "pending"
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self.feedback_queue: asyncio.Queue = asyncio.Queue()
        self.task: asyncio.Task | None = None
        self.final_state: dict | None = None
        self.error: str | None = None
        self.created_at: float = time.time()

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "target_id": self.target_id,
            "target_domain": self.target_domain,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at,
        }


class AgentSessionManager:
    def __init__(self):
        self._sessions: dict[int, AgentSession] = {}

    def create(self, session_id: int, target_id: int, target_domain: str) -> AgentSession:
        session = AgentSession(session_id, target_id, target_domain)
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: int) -> AgentSession | None:
        return self._sessions.get(session_id)

    def remove(self, session_id: int):
        self._sessions.pop(session_id, None)


_session_manager = AgentSessionManager()


# ── Request/Response Models ──────────────────────────────────────────────────


class AgentRunRequest(BaseModel):
    goal: str = "find all vulnerabilities"
    program_scope: Optional[Dict[str, List[str]]] = None
    platform: Optional[str] = None
    program_handle: Optional[str] = None
    max_steps: int = 10


class AgentSessionResponse(BaseModel):
    session_id: int
    target_id: int
    target_domain: str
    status: str
    error: Optional[str] = None


class AgentFeedbackRequest(BaseModel):
    action: str = "interrupt"
    message: Optional[str] = None


class AgentStateResponse(BaseModel):
    session_id: int
    status: str
    target_domain: str
    phases_executed: List[str]
    tools_executed: List[str]
    subdomains_count: int
    live_hosts_count: int
    findings_count: int
    step_count: int
    guidance: List[str]
    strategy: Dict[str, Any]
    platform_context: Dict[str, Any]
    error: Optional[str] = None


class AgentRunResponse(AgentStateResponse):
    pass


# ── Event Streaming ─────────────────────────────────────────────────────────


def _sse_format(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _event_callback(session: AgentSession, node_name: str, node_output: dict):
    if node_name == "stop":
        await session.event_queue.put(("complete", {"status": "completed"}))
        return

    guidance = node_output.get("guidance", [])
    strategy = node_output.get("strategy")
    next_action = node_output.get("next_action", "")
    interrupt_reason = node_output.get("interrupt_reason", "")

    if guidance:
        for g in guidance:
            await session.event_queue.put(("guidance", {"text": g, "node": node_name}))

    if strategy:
        await session.event_queue.put(("strategy", strategy))

    if next_action and next_action.startswith("phase_"):
        await session.event_queue.put(
            ("phase", {"name": next_action, "node": node_name})
        )

    if interrupt_reason:
        await session.event_queue.put(("interrupt", {"reason": interrupt_reason}))

    # Send a state snapshot
    state_snapshot = {
        "node": node_name,
        "next_action": next_action,
        "subdomains": node_output.get("discovered_subdomains", []),
        "live_hosts": node_output.get("live_hosts", []),
    }
    await session.event_queue.put(("state", state_snapshot))


async def _run_agent_task(
    session: AgentSession,
    runner: ReconAgentRunner,
    target_domain: str,
    goal: str,
    program_scope: dict | None,
    platform: str | None,
    program_handle: str | None,
    max_steps: int,
):
    try:
        session.status = "running"

        async def callback(node_name: str, node_output: dict):
            # Check for user feedback before processing
            if not session.feedback_queue.empty():
                feedback = await session.feedback_queue.get()
                await session.event_queue.put(
                    ("feedback", {"action": feedback.get("action", "interrupt"), "message": feedback.get("message")})
                )

            await _event_callback(session, node_name, node_output)

        final_state = await runner.run_reconnaissance_stream(
            target_domain=target_domain,
            event_callback=callback,
            goal=goal,
            program_scope=program_scope,
            platform=platform,
            program_handle=program_handle,
            max_steps=max_steps,
        )

        session.final_state = final_state
        session.status = "completed"
        await session.event_queue.put(("complete", {"status": "completed"}))

    except asyncio.CancelledError:
        session.status = "interrupted"
        await session.event_queue.put(("complete", {"status": "interrupted"}))
        async with get_database().get_session() as db_session:
            repo = SessionRepository(db_session)
            await repo.update_status(session.session_id, "interrupted")
    except Exception as e:
        logger.error(f"Agent task failed: {e}")
        session.status = "error"
        session.error = str(e)
        await session.event_queue.put(("complete", {"status": "error", "error": str(e)}))
        async with get_database().get_session() as db_session:
            repo = SessionRepository(db_session)
            await repo.update_status(session.session_id, "error", error=str(e))
    else:
        async with get_database().get_session() as db_session:
            repo = SessionRepository(db_session)
            await repo.update_status(session.session_id, "completed")


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/run", response_model=AgentRunResponse)
async def run_agent(
    target_id: int,
    req: AgentRunRequest,
    auth: bool = Depends(verify_auth),
    repo: TargetRepository = Depends(get_target_repo),
    session_repo: SessionRepository = Depends(get_session_repo),
    runner: ReconAgentRunner = Depends(get_agent_runner),
):
    target = await repo.get_target(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    scan_session = await session_repo.create_session(
        target_id=target_id,
        workflow="agent",
        config_snapshot=req.model_dump(mode="json"),
    )

    try:
        final_state = await runner.run_reconnaissance(
            target_domain=target.target,
            goal=req.goal,
            program_scope=req.program_scope,
            platform=req.platform,
            program_handle=req.program_handle,
            max_steps=req.max_steps,
        )
        status = "interrupted" if (final_state.next_action == "interrupt" or final_state.interrupt_reason) else "completed"
        await session_repo.update_status(
            scan_session.id,
            status,
            error=final_state.interrupt_reason if status != "completed" else None,
        )
    except Exception as e:
        await session_repo.update_status(scan_session.id, "error", error=str(e))
        return AgentRunResponse(
            session_id=scan_session.id,
            status="error",
            target_domain=target.target,
            phases_executed=[],
            tools_executed=[],
            subdomains_count=0,
            live_hosts_count=0,
            findings_count=0,
            step_count=0,
            guidance=[],
            strategy={},
            platform_context={},
            error=str(e),
        )

    return AgentRunResponse(
        session_id=scan_session.id,
        status=status,
        target_domain=final_state.target_domain,
        phases_executed=final_state.phases_tried,
        tools_executed=final_state.tools_tried,
        subdomains_count=len(final_state.discovered_subdomains),
        live_hosts_count=len(final_state.live_hosts),
        findings_count=len(final_state.findings),
        step_count=final_state.step_count,
        guidance=final_state.guidance,
        strategy=final_state.strategy,
        platform_context=final_state.platform_context,
        error=final_state.interrupt_reason or None,
    )


@router.post("/start", response_model=AgentSessionResponse)
async def start_agent_session(
    target_id: int,
    req: AgentRunRequest,
    auth: bool = Depends(verify_auth),
    repo: TargetRepository = Depends(get_target_repo),
    session_repo: SessionRepository = Depends(get_session_repo),
    runner: ReconAgentRunner = Depends(get_agent_runner),
):
    target = await repo.get_target(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    scan_session = await session_repo.create_session(
        target_id=target_id,
        workflow="agent",
        config_snapshot=req.model_dump(mode="json"),
    )

    session = _session_manager.create(scan_session.id, target_id, target.target)

    session.task = asyncio.create_task(
        _run_agent_task(
            session=session,
            runner=runner,
            target_domain=target.target,
            goal=req.goal,
            program_scope=req.program_scope,
            platform=req.platform,
            program_handle=req.program_handle,
            max_steps=req.max_steps,
        )
    )

    logger.info(f"Started agent session {session.session_id} for target {target_id}")
    return AgentSessionResponse(
        session_id=session.session_id,
        target_id=target_id,
        target_domain=target.target,
        status="running",
    )


@router.get("/{session_id}/stream")
async def stream_agent_events(
    target_id: int,
    session_id: int,
    request: Request,
    auth: bool = Depends(verify_auth),
):
    session = _session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.target_id != target_id:
        raise HTTPException(status_code=404, detail="Session not found for this target")

    async def event_generator():
        try:
            # Send initial event
            yield _sse_format("session", {"session_id": session_id, "status": session.status})

            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break

                try:
                    event_type, data = await asyncio.wait_for(
                        session.event_queue.get(), timeout=2.0
                    )
                    yield _sse_format(event_type, data)

                    if event_type == "complete":
                        break
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield _sse_format("heartbeat", {"t": time.time()})
                    continue

        except asyncio.CancelledError:
            pass
        finally:
            _session_manager.remove(session_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/feedback")
async def send_agent_feedback(
    target_id: int,
    session_id: int,
    req: AgentFeedbackRequest,
    auth: bool = Depends(verify_auth),
):
    session = _session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.target_id != target_id:
        raise HTTPException(status_code=404, detail="Session not found for this target")

    await session.feedback_queue.put({"action": req.action, "message": req.message})
    logger.info(f"Feedback for session {session_id}: {req.action} - {req.message}")
    return {"status": "received", "session_id": session_id}


@router.get("/{session_id}/state", response_model=AgentStateResponse)
async def get_agent_state(
    target_id: int,
    session_id: int,
    auth: bool = Depends(verify_auth),
):
    session = _session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.target_id != target_id:
        raise HTTPException(status_code=404, detail="Session not found for this target")

    if session.final_state:
        fs = session.final_state
        return AgentStateResponse(
            session_id=session_id,
            status=session.status,
            target_domain=fs.target_domain,
            phases_executed=fs.phases_tried,
            tools_executed=fs.tools_tried,
            subdomains_count=len(fs.discovered_subdomains),
            live_hosts_count=len(fs.live_hosts),
            findings_count=len(fs.findings),
            step_count=fs.step_count,
            guidance=fs.guidance,
            strategy=fs.strategy,
            platform_context=fs.platform_context,
            error=fs.interrupt_reason or session.error,
        )

    return AgentStateResponse(
        session_id=session_id,
        status=session.status,
        target_domain=session.target_domain,
        phases_executed=[],
        tools_executed=[],
        subdomains_count=0,
        live_hosts_count=0,
        findings_count=0,
        step_count=0,
        guidance=[],
        strategy={},
        platform_context={},
        error=session.error,
    )
