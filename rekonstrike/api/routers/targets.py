from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from ..deps import verify_auth, get_db
from ...repositories.target_repo import TargetRepository
from ...repositories.host_repo import HostRepository

router = APIRouter(prefix="/targets", tags=["targets"])

@router.get("")
async def list_targets(auth: bool = Depends(verify_auth), db=Depends(get_db)):
    async with await db.get_session() as s:
        repo = TargetRepository(s)
        targets = await repo.list_targets()
        return [
            {
                "id": r.id, "target": r.target, "target_type": r.target_type,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in targets
        ]

@router.get("/{target_id}/subdomains")
async def get_subdomains(target_id: int, resolved: Optional[bool] = None,
                          page: int = 0, size: int = 100,
                          auth: bool = Depends(verify_auth), db=Depends(get_db)):
    async with await db.get_session() as s:
        repo = TargetRepository(s)
        items, total = await repo.get_subdomains(target_id, resolved, page, size)
        return {
            "total": total,
            "page": page,
            "size": size,
            "items": [
                {"id": r.id, "subdomain": r.subdomain, "source": r.source,
                 "resolved": r.resolved, "ip_address": r.ip_address,
                 "created_at": r.created_at.isoformat() if r.created_at else None}
                for r in items
            ],
        }

@router.get("/{target_id}/live-hosts")
async def get_live_hosts(target_id: int, page: int = 0, size: int = 50,
                          auth: bool = Depends(verify_auth), db=Depends(get_db)):
    async with await db.get_session() as s:
        repo = HostRepository(s)
        items, total = await repo.get_live_hosts(target_id, page, size)
        return {
            "total": total,
            "page": page,
            "size": size,
            "items": [
                {
                    "id": r.id, "url": r.url, "raw_url": r.raw_url,
                    "status_code": r.status_code,
                    "title": r.title, "technologies": r.technologies,
                    "web_server": r.web_server, "content_length": r.content_length,
                    "roi_score": r.roi_score, "screenshot_path": r.screenshot_path,
                    "ssl_info": r.ssl_info,
                }
                for r in items
            ],
        }

@router.get("/{target_id}/vulnerabilities")
async def get_vulnerabilities(target_id: int, severity: Optional[str] = None,
                               page: int = 0, size: int = 50,
                               auth: bool = Depends(verify_auth), db=Depends(get_db)):
    async with await db.get_session() as s:
        repo = HostRepository(s)
        items, total = await repo.get_vulnerabilities(target_id, severity, page, size)
        return {
            "total": total,
            "page": page,
            "size": size,
            "items": [
                {
                    "id": r.id, "template_id": r.template_id, "name": r.name,
                    "severity": r.severity, "description": r.description,
                    "matched_at": r.matched_at, "curl_command": r.curl_command,
                }
                for r in items
            ],
        }
