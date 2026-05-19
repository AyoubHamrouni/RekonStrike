from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from ..deps import verify_auth, get_scan_service, get_session_repo, settings
from ..manager import manager
from ...services.scan_service import ScanService
from ...repositories.session_repo import SessionRepository
from ...phases import get_registered_phases

router = APIRouter(prefix="/scan", tags=["scans"])


class ScanRequest(BaseModel):
    target: str
    target_type: str = "wildcard"
    phases: Optional[List[int]] = None


@router.get("/phases")
async def list_phases(auth: bool = Depends(verify_auth)):
    return get_registered_phases()


@router.post("")
async def start_scan(
    req: ScanRequest,
    auth: bool = Depends(verify_auth),
    service: ScanService = Depends(get_scan_service),
):
    session_id_wrap = [None]

    async def on_event(event: str, data: dict):
        if session_id_wrap[0]:
            await manager.broadcast(session_id_wrap[0], event, data)

    session_id = await service.start_scan(
        req.target, req.target_type, req.phases, on_event=on_event
    )
    session_id_wrap[0] = session_id

    return {
        "message": "Scan initiated",
        "target": req.target,
        "target_type": req.target_type,
        "session_id": session_id,
    }


@router.post("/{session_id}/cancel")
async def cancel_scan(
    session_id: int,
    auth: bool = Depends(verify_auth),
    service: ScanService = Depends(get_scan_service),
):
    if await service.cancel_scan(session_id):
        await manager.broadcast(session_id, "scan_cancelled", {})
        return {"message": "Scan cancelled", "session_id": session_id}
    return {"message": "No active scan found", "session_id": session_id}


@router.websocket("/ws/{session_id}")
async def ws_scan(ws: WebSocket, session_id: int):
    if settings.server_api_key:
        token = ws.query_params.get("token")
        if token != settings.server_api_key:
            await ws.close(code=1008)
            return
    elif not settings.allow_insecure_dev_auth:
        await ws.close(code=1011)
        return
    await manager.connect(session_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id, ws)


@router.get("/sessions")
async def list_sessions(
    limit: int = 50,
    auth: bool = Depends(verify_auth),
    repo: SessionRepository = Depends(get_session_repo),
):
    sessions = await repo.list_sessions(limit)
    return [
        {
            "id": r.id,
            "target_id": r.target_id,
            "workflow": r.workflow,
            "status": r.status,
            "current_phase": r.current_phase,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
        }
        for r in sessions
    ]


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: int,
    auth: bool = Depends(verify_auth),
    repo: SessionRepository = Depends(get_session_repo),
):
    r = await repo.get_session(session_id)
    if not r:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": r.id,
        "target_id": r.target_id,
        "workflow": r.workflow,
        "status": r.status,
        "current_phase": r.current_phase,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "ended_at": r.ended_at.isoformat() if r.ended_at else None,
        "error_message": r.error_message,
        "stats": r.stats,
    }
