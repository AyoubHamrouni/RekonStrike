import asyncio
import csv
import io
import json
import os
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from .. import __version__
from ..config import load_settings
from ..database import Database, ScanSession
from ..engine import Pipeline
from ..phases import get_registered_phases
from ..tasks import get_task_manager

settings = load_settings()
db = Database(settings)

app = FastAPI(
    title="RekonStrike API",
    version=__version__,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Authentication ──────────────────────────────────────────────────────────

security = HTTPBearer(auto_error=False)

async def verify_auth(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    if not settings.server_api_key:
        return True
    if credentials is None or credentials.credentials != settings.server_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True

# ─── Static Files ─────────────────────────────────────────────────────────────

STATIC_DIR = Path(__file__).parent.parent.parent / "ui" / "dist"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

# ─── Connection Manager ─────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[int, list[WebSocket]] = {}

    async def connect(self, session_id: int, ws: WebSocket):
        await ws.accept()
        if session_id not in self.active:
            self.active[session_id] = []
        self.active[session_id].append(ws)

    def disconnect(self, session_id: int, ws: WebSocket):
        if session_id in self.active:
            self.active[session_id].remove(ws)
            if not self.active[session_id]:
                del self.active[session_id]

    async def broadcast(self, session_id: int, event: str, data: dict):
        if session_id in self.active:
            msg = json.dumps({"event": event, "data": data})
            for ws in self.active[session_id]:
                try:
                    await ws.send_text(msg)
                except Exception:
                    pass

manager = ConnectionManager()

# Task queue
tm: "TaskManager" = None


# ─── Events ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_cmd
    ini_path = os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
    if os.path.exists(ini_path):
        alembic_cfg = AlembicConfig(ini_path)
        alembic_cmd.upgrade(alembic_cfg, "head")
    else:
        await db.create_all()
    global tm
    tm = get_task_manager(settings.redis_url)
    await tm.start()


@app.on_event("shutdown")
async def shutdown():
    if tm:
        await tm.close()
    await db.close()


# ─── Models ───────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    target: str
    target_type: str = "wildcard"
    phases: Optional[list[int]] = None


# ─── Background Scan Runner ────────────────────────────────────────────────────

async def _run_scan_via_task_manager(session_id: int, target: str, target_type: str,
                                      phases: Optional[list[int]]):
    async def on_event(event: str, data: dict):
        await manager.broadcast(session_id, event, data)

    try:
        queued = await tm.enqueue_scan(
            session_id=session_id, target=target, target_type=target_type,
            phases=phases, on_event=on_event,
        )
        if not queued:
            pass
    except Exception as e:
        await manager.broadcast(session_id, "scan_error", {"error": str(e)})


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": __version__, "python": "3.14+"}


@app.get("/phases")
async def list_phases(auth: bool = Depends(verify_auth)):
    return get_registered_phases()


@app.post("/scan")
async def start_scan(req: ScanRequest, auth: bool = Depends(verify_auth)):
    from ..database import ScanSession
    from sqlalchemy import select

    scope_obj = await db.get_or_create_target(req.target, req.target_type, await db.get_session())

    async with await db.get_session() as s:
        async with s.begin():
            scan_sesh = ScanSession(
                target_id=scope_obj.id,
                workflow=req.target_type,
                status="running",
                config_snapshot=settings.model_dump(mode="json"),
            )
            s.add(scan_sesh)
            await s.flush()
            session_id = scan_sesh.id

    asyncio.create_task(
        _run_scan_via_task_manager(session_id, req.target, req.target_type, req.phases)
    )

    return {
        "message": "Scan initiated",
        "target": req.target,
        "target_type": req.target_type,
        "session_id": session_id,
    }


@app.post("/scan/{session_id}/cancel")
async def cancel_scan(session_id: int, auth: bool = Depends(verify_auth)):
    cancelled = await tm.cancel_scan(session_id)
    if cancelled:
        from ..database import ScanSession
        async with await db.get_session() as s:
            async with s.begin():
                from sqlalchemy import update
                await s.execute(
                    update(ScanSession).where(ScanSession.id == session_id)
                    .values(status="cancelled")
                )
        await manager.broadcast(session_id, "scan_cancelled", {})
        return {"message": "Scan cancelled", "session_id": session_id}
    return {"message": "No active scan found", "session_id": session_id}


@app.websocket("/ws/scan/{session_id}")
async def ws_scan(ws: WebSocket, session_id: int):
    await manager.connect(session_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id, ws)


# ─── Sessions ─────────────────────────────────────────────────────────────────

@app.get("/sessions")
async def list_sessions(limit: int = 50, auth: bool = Depends(verify_auth)):
    from ..database import ScanSession
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select
            rows = await s.execute(
                select(ScanSession).order_by(ScanSession.started_at.desc()).limit(limit)
            )
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
                for r in rows.scalars().all()
            ]


@app.get("/sessions/{session_id}")
async def get_session(session_id: int, auth: bool = Depends(verify_auth)):
    from ..database import ScanSession
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select
            row = await s.execute(
                select(ScanSession).where(ScanSession.id == session_id)
            )
            r = row.scalar_one_or_none()
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


# ─── Targets ─────────────────────────────────────────────────────────────────

@app.get("/targets")
async def list_targets(auth: bool = Depends(verify_auth)):
    from ..database import ScopeTarget
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select
            rows = await s.execute(select(ScopeTarget).order_by(ScopeTarget.created_at.desc()))
            return [
                {
                    "id": r.id, "target": r.target, "target_type": r.target_type,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows.scalars().all()
            ]


@app.get("/targets/{target_id}/subdomains")
async def get_subdomains(target_id: int, resolved: Optional[bool] = None,
                          sort: str = "subdomain", order: str = "asc",
                          page: int = 0, size: int = 100,
                          auth: bool = Depends(verify_auth)):
    from ..database import Subdomain
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select, func
            stmt = select(Subdomain).where(Subdomain.target_id == target_id)
            if resolved is not None:
                stmt = stmt.where(Subdomain.resolved == resolved)

            # Count total
            count_stmt = select(func.count()).select_from(Subdomain).where(Subdomain.target_id == target_id)
            if resolved is not None:
                count_stmt = count_stmt.where(Subdomain.resolved == resolved)
            total = (await s.execute(count_stmt)).scalar() or 0

            # Sort
            sort_col = getattr(Subdomain, sort, Subdomain.subdomain)
            stmt = stmt.order_by(sort_col.asc() if order == "asc" else sort_col.desc())

            # Paginate
            stmt = stmt.offset(page * size).limit(size)
            rows = await s.execute(stmt)

            return {
                "total": total,
                "page": page,
                "size": size,
                "items": [
                    {"id": r.id, "subdomain": r.subdomain, "source": r.source,
                     "resolved": r.resolved, "ip_address": r.ip_address,
                     "created_at": r.created_at.isoformat() if r.created_at else None}
                    for r in rows.scalars().all()
                ],
            }


@app.get("/targets/{target_id}/live-hosts")
async def get_live_hosts(target_id: int,
                          sort: str = "roi_score", order: str = "desc",
                          page: int = 0, size: int = 50,
                          auth: bool = Depends(verify_auth)):
    from ..database import LiveHost, Subdomain
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select, func
            stmt = select(LiveHost).join(Subdomain).where(Subdomain.target_id == target_id)

            count_stmt = select(func.count()).select_from(LiveHost).join(Subdomain).where(Subdomain.target_id == target_id)
            total = (await s.execute(count_stmt)).scalar() or 0

            sort_col = getattr(LiveHost, sort, LiveHost.roi_score)
            stmt = stmt.order_by(sort_col.asc() if order == "asc" else sort_col.desc())
            stmt = stmt.offset(page * size).limit(size)
            rows = await s.execute(stmt)

            return {
                "total": total,
                "page": page,
                "size": size,
                "items": [
                    {
                        "id": r.id, "url": r.url, "status_code": r.status_code,
                        "title": r.title, "technologies": r.technologies,
                        "web_server": r.web_server, "content_length": r.content_length,
                        "roi_score": r.roi_score, "screenshot_path": r.screenshot_path,
                        "ssl_info": r.ssl_info,
                    }
                    for r in rows.scalars().all()
                ],
            }


@app.get("/targets/{target_id}/vulnerabilities")
async def get_vulnerabilities(target_id: int, severity: Optional[str] = None,
                               sort: str = "severity", order: str = "desc",
                               page: int = 0, size: int = 50,
                               auth: bool = Depends(verify_auth)):
    from ..database import Vulnerability, LiveHost, Subdomain
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select, func
            stmt = select(Vulnerability).join(LiveHost).join(Subdomain).where(
                Subdomain.target_id == target_id
            )
            count_stmt = select(func.count()).select_from(Vulnerability).join(LiveHost).join(Subdomain).where(
                Subdomain.target_id == target_id
            )
            if severity:
                stmt = stmt.where(Vulnerability.severity == severity)
                count_stmt = count_stmt.where(Vulnerability.severity == severity)
            total = (await s.execute(count_stmt)).scalar() or 0

            sort_col = getattr(Vulnerability, sort, Vulnerability.severity)
            stmt = stmt.order_by(sort_col.asc() if order == "asc" else sort_col.desc())
            stmt = stmt.offset(page * size).limit(size)
            rows = await s.execute(stmt)

            return {
                "total": total,
                "page": page,
                "size": size,
                "items": [
                    {"id": r.id, "name": r.name, "severity": r.severity,
                     "template_id": r.template_id, "matched_at": r.matched_at,
                     "description": r.description}
                    for r in rows.scalars().all()
                ],
            }


@app.get("/targets/{target_id}/endpoints")
async def get_endpoints(target_id: int,
                         page: int = 0, size: int = 100,
                         auth: bool = Depends(verify_auth)):
    from ..database import Endpoint, LiveHost, Subdomain
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select, func
            stmt = select(Endpoint).join(LiveHost).join(Subdomain).where(
                Subdomain.target_id == target_id
            )
            count_stmt = select(func.count()).select_from(Endpoint).join(LiveHost).join(Subdomain).where(
                Subdomain.target_id == target_id
            )
            total = (await s.execute(count_stmt)).scalar() or 0
            stmt = stmt.offset(page * size).limit(size).order_by(Endpoint.created_at.desc())
            rows = await s.execute(stmt)

            return {
                "total": total,
                "page": page,
                "size": size,
                "items": [
                    {"id": r.id, "url": r.url, "method": r.method,
                     "status_code": r.status_code, "content_type": r.content_type,
                     "source": r.source}
                    for r in rows.scalars().all()
                ],
            }


@app.get("/targets/{target_id}/stats")
async def get_target_stats(target_id: int, auth: bool = Depends(verify_auth)):
    from ..database import Subdomain, LiveHost, Vulnerability, Endpoint, ScanSession
    from sqlalchemy import select, func
    async with await db.get_session() as s:
        async with s.begin():
            subdomains = await db.count(Subdomain, session=s, target_id=target_id)
            resolved = await db.count(Subdomain, session=s, target_id=target_id, resolved=True)
            sessions = await db.count(ScanSession, session=s, target_id=target_id)

            live_hosts = (await s.execute(
                select(func.count()).select_from(LiveHost)
                .join(Subdomain).where(Subdomain.target_id == target_id)
            )).scalar() or 0

            vulns = (await s.execute(
                select(func.count()).select_from(Vulnerability)
                .join(LiveHost).join(Subdomain).where(Subdomain.target_id == target_id)
            )).scalar() or 0

            endpoints = (await s.execute(
                select(func.count()).select_from(Endpoint)
                .join(LiveHost).join(Subdomain).where(Subdomain.target_id == target_id)
            )).scalar() or 0

    return {
        "subdomains": subdomains,
        "resolved_subdomains": resolved,
        "live_hosts": live_hosts,
        "vulnerabilities": vulns,
        "endpoints": endpoints,
        "sessions": sessions,
    }


# ─── Export ──────────────────────────────────────────────────────────────────

@app.get("/targets/{target_id}/export/subdomains")
async def export_subdomains(target_id: int, format: str = "json",
                             auth: bool = Depends(verify_auth)):
    from ..database import Subdomain
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select
            rows = await s.execute(
                select(Subdomain).where(Subdomain.target_id == target_id)
            )
            items = [
                {"subdomain": r.subdomain, "source": r.source,
                 "resolved": r.resolved, "ip_address": r.ip_address}
                for r in rows.scalars().all()
            ]
    return _export_response(items, format, "subdomains")


@app.get("/targets/{target_id}/export/live-hosts")
async def export_live_hosts(target_id: int, format: str = "json",
                             auth: bool = Depends(verify_auth)):
    from ..database import LiveHost, Subdomain
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select
            rows = await s.execute(
                select(LiveHost).join(Subdomain).where(Subdomain.target_id == target_id)
            )
            items = [
                {"url": r.url, "status_code": r.status_code, "title": r.title,
                 "technologies": r.technologies, "web_server": r.web_server,
                 "roi_score": r.roi_score, "content_length": r.content_length}
                for r in rows.scalars().all()
            ]
    return _export_response(items, format, "live-hosts")


@app.get("/targets/{target_id}/export/vulnerabilities")
async def export_vulnerabilities(target_id: int, format: str = "json",
                                  auth: bool = Depends(verify_auth)):
    from ..database import Vulnerability, LiveHost, Subdomain
    async with await db.get_session() as s:
        async with s.begin():
            from sqlalchemy import select
            rows = await s.execute(
                select(Vulnerability).join(LiveHost).join(Subdomain).where(
                    Subdomain.target_id == target_id
                )
            )
            items = [
                {"name": r.name, "severity": r.severity, "template_id": r.template_id,
                 "matched_at": r.matched_at, "description": r.description}
                for r in rows.scalars().all()
            ]
    return _export_response(items, format, "vulnerabilities")


def _export_response(items: list, format: str, filename: str) -> Response:
    if format == "csv":
        if not items:
            return Response(content="", media_type="text/csv", headers={
                "Content-Disposition": f"attachment; filename={filename}.csv"
            })
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=items[0].keys())
        writer.writeheader()
        writer.writerows(items)
        return Response(content=output.getvalue(), media_type="text/csv", headers={
            "Content-Disposition": f"attachment; filename={filename}.csv"
        })
    return JSONResponse(content=items, headers={
        "Content-Disposition": f"attachment; filename={filename}.json"
    })


# ─── SPA Fallback ─────────────────────────────────────────────────────────────

if STATIC_DIR.exists():
    index_html = STATIC_DIR / "index.html"
    if index_html.exists():
        content = index_html.read_text()

        @app.get("/")
        @app.get("/new")
        @app.get("/target/{path:path}")
        @app.get("/scan/{path:path}")
        async def serve_spa():
            return HTMLResponse(content)
