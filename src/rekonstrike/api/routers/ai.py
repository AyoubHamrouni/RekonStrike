from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException

from ..deps import verify_auth, get_target_repo, get_host_repo, settings
from ...repositories.target_repo import TargetRepository
from ...repositories.host_repo import HostRepository
from ...ai import analyze_surface, run_triage, get_test_suggestions, run_scope_advisor

router = APIRouter(prefix="/targets/{target_id}/ai", tags=["ai"])

@router.post("/surface")
async def ai_surface_analysis(
    target_id: int,
    auth: bool = Depends(verify_auth),
    repo: TargetRepository = Depends(get_target_repo),
    host_repo: HostRepository = Depends(get_host_repo)
):
    # 1. Get subdomains
    items, _ = await repo.get_subdomains(target_id, size=1000)
    subdomains = [r.subdomain for r in items]
    
    # 2. Get live hosts
    host_items, _ = await host_repo.get_live_hosts(target_id, size=200)
    live_hosts = [
        {"url": r.url, "title": r.title, "technologies": r.technologies}
        for r in host_items
    ]
    
    if not subdomains:
        raise HTTPException(status_code=400, detail="No subdomains found for this target")
        
    result = await analyze_surface(settings, subdomains, live_hosts)
    return result

@router.post("/triage")
async def ai_vuln_triage(
    target_id: int,
    auth: bool = Depends(verify_auth),
    host_repo: HostRepository = Depends(get_host_repo)
):
    # Get high/critical vulnerabilities
    items, _ = await host_repo.get_vulnerabilities(target_id, severity=None, size=100)
    # Filter for high/critical in memory if the repo doesn't support list filter
    to_triage = [v for v in items if v.severity in ["high", "critical"]]
    
    if not to_triage:
        return []
        
    results = []
    for vuln in to_triage:
        # We need the URL for the vulnerability
        # This is simplified; in a real app, we'd join with live_hosts
        url = vuln.matched_at or "Unknown" 
        
        finding_dict = {
            "name": vuln.name,
            "template_id": vuln.template_id,
            "severity": vuln.severity,
            "matched_at": vuln.matched_at
        }
        
        verdict = await run_triage(settings, finding_dict, url)
        results.append({
            "id": vuln.id,
            "name": vuln.name,
            "severity": vuln.severity,
            **verdict
        })
    
    return results

@router.post("/fp-filter")
async def ai_fp_filter(
    target_id: int,
    auth: bool = Depends(verify_auth),
    host_repo: HostRepository = Depends(get_host_repo)
):
    # Similar to triage but specifically for FP scoring
    items, _ = await host_repo.get_vulnerabilities(target_id, size=50)
    results = []
    for vuln in items:
        # Simplified FP check
        results.append({
            "id": vuln.id,
            "name": vuln.name,
            "fp_score": 0.85, # Mock score for now
            "reasoning": "Standard pattern match looks legitimate."
        })
    return results

@router.post("/scope")
async def ai_scope_analysis(
    target_id: int,
    auth: bool = Depends(verify_auth),
    repo: TargetRepository = Depends(get_target_repo)
):
    # Fetch program scope if available
    # For now, we'll use a mock scope or fetch from DB if implemented
    from ...database import ProgramScope
    from sqlalchemy import select
    
    # This requires a db session which we can get from repo or deps
    # For simplicity, let's assume we have some scope data
    in_scope = ["*.example.com"]
    out_of_scope = ["dev.example.com", "test.example.com"]
    
    items, _ = await repo.get_subdomains(target_id, size=500)
    discovered = [r.subdomain for r in items]
    
    result = await run_scope_advisor(settings, in_scope, out_of_scope, discovered)
    return result

@router.post("/advisor")
async def ai_test_advisor(
    target_id: int,
    module: str = "injection",
    auth: bool = Depends(verify_auth),
    host_repo: HostRepository = Depends(get_host_repo)
):
    # Get top hosts
    items, _ = await host_repo.get_live_hosts(target_id, size=5)
    if not items:
        raise HTTPException(status_code=400, detail="No live hosts found")
        
    results = []
    for host in items:
        # Get suggestions based on tech stack
        suggestions = await get_test_suggestions(
            settings,
            {"url": host.url, "technologies": host.technologies},
            module=module,
            discovered_endpoints=[]
        )
        results.append({
            "url": host.url,
            "suggestions": suggestions
        })
    return results

@router.post("/report")
async def ai_report_drafter(
    target_id: int,
    vuln_id: int,
    auth: bool = Depends(verify_auth),
    host_repo: HostRepository = Depends(get_host_repo)
):
    # Fetch the specific vulnerability
    # Simplified: finding vuln in memory or use repo
    items, _ = await host_repo.get_vulnerabilities(target_id, size=1000)
    vuln = next((v for v in items if v.id == vuln_id), None)
    
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
        
    from ...ai import run_report_drafter
    report = await run_report_drafter(
        settings,
        {"name": vuln.name, "template_id": vuln.template_id, "description": vuln.description, "severity": vuln.severity},
        vuln.matched_at or "Unknown"
    )
    return {"report": report}
