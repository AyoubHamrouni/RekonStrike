"""Phase pipeline — deterministic recon phases the agent dispatches to.

Each phase bundles related tools into a logical step. The LLM chooses which
phase to run next; the phase itself handles tool orchestration without LLM
involvement. This avoids wasting tokens on per-tool decisions."""

import logging
from typing import Callable

from .state import ReconState
from .tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

_phase_registry: dict[str, dict] = {}


def register_phase(
    name: str,
    number: int,
    description: str,
    dependencies: list[str] | None = None,
):
    def decorator(func: Callable[[ReconState, ToolRegistry], dict]):
        _phase_registry[name] = {
            "name": name,
            "number": number,
            "description": description,
            "dependencies": dependencies or [],
            "run": func,
        }
        return func
    return decorator


def list_phases() -> list[dict]:
    return sorted(_phase_registry.values(), key=lambda p: p["number"])


def _log_strategy(state: ReconState):
    strategy = state.strategy
    if strategy:
        areas = strategy.get("focus_areas", [])
        targets = strategy.get("priority_targets", [])
        logger.info(
            f"Strategy: focus={areas} priority_targets={targets} "
            f"depth={strategy.get('depth_vs_breadth', 'N/A')}"
        )


async def run_phase(name: str, state: ReconState) -> dict:
    registry = ToolRegistry()
    phase = _phase_registry.get(name)
    if not phase:
        return {
            "success": False,
            "error": f"unknown phase: {name}",
            "tools_run": [],
            "interrupt_reason": f"Unknown phase: {name}",
        }
    logger.info(f"Running phase {phase['number']}: {phase['name']}")
    _log_strategy(state)
    result = await phase["run"](state, registry)
    result["phase_name"] = name
    result["phase_number"] = phase["number"]
    return result


# ─── Phase implementations ────────────────────────────────────────────────


@register_phase("phase_0_validate", 0, "Validate target and prepare scope")
async def phase_0_validate(state: ReconState, registry: ToolRegistry) -> dict:
    updates = {}
    scope = state.program_scope
    if not scope:
        scope = {"in_scope": [state.target_domain], "out_of_scope": []}
    updates["program_scope"] = scope
    return {"success": True, "error": None, "tools_run": [], **updates}


@register_phase("phase_1_passive", 1, "Passive reconnaissance — discover subdomains via OSINT", ["phase_0_validate"])
async def phase_1_passive(state: ReconState, registry: ToolRegistry) -> dict:
    result = await registry.call_tool("passive_recon", target=state.target_domain)
    tools_run = ["passive_recon"]
    if not result.get("success"):
        return {
            "success": False,
            "error": result.get("error"),
            "tools_run": tools_run,
            "interrupt_reason": f"Passive recon failed: {result.get('error')}",
        }
    new_subs = result["data"].get("subdomains", [])

    # Filter by priority targets if strategy specifies them
    priority_targets = state.strategy.get("priority_targets", [])
    if priority_targets:
        prioritized = [s for s in priority_targets if s in new_subs]
        rest = [s for s in new_subs if s not in priority_targets]
        new_subs = prioritized + rest

    return {
        "success": True,
        "error": None,
        "tools_run": tools_run,
        "discovered_subdomains": list(set(state.discovered_subdomains + new_subs)),
    }


@register_phase("phase_3_httpprobe", 3, "HTTP probing — find live hosts and detect tech stack", ["phase_1_passive"])
async def phase_3_httpprobe(state: ReconState, registry: ToolRegistry) -> dict:
    if not state.discovered_subdomains:
        return {
            "success": False,
            "error": "no subdomains to probe",
            "tools_run": [],
            "interrupt_reason": "No subdomains discovered — cannot probe",
        }

    targets = [f"http://{s}" if not s.startswith("http") else s for s in state.discovered_subdomains]

    # Sort priority targets first when strategy specifies them
    priority_targets = state.strategy.get("priority_targets", [])
    if priority_targets:
        priority_urls = [f"http://{t}" for t in priority_targets]
        prioritized = [t for t in targets if t in priority_urls]
        rest = [t for t in targets if t not in priority_urls]
        targets = prioritized + rest

    result = await registry.call_tool(
        "http_probe",
        targets=targets,
        scope_filter=state.program_scope,
    )
    tools_run = ["http_probe"]
    if not result.get("success"):
        return {
            "success": False,
            "error": result.get("error"),
            "tools_run": tools_run,
            "interrupt_reason": f"HTTP probing failed: {result.get('error')}",
        }
    new_hosts = result["data"].get("probed", [])
    return {
        "success": True,
        "error": None,
        "tools_run": tools_run,
        "live_hosts": state.live_hosts + new_hosts,
    }


@register_phase("phase_4_content", 4, "Content discovery — crawl and fuzz endpoints", ["phase_3_httpprobe"])
async def phase_4_content(state: ReconState, registry: ToolRegistry) -> dict:
    if not state.live_hosts:
        return {
            "success": False,
            "error": "no live hosts to crawl",
            "tools_run": [],
            "interrupt_reason": "No live hosts — cannot discover content",
        }

    urls = [h["url"] for h in state.live_hosts]

    result = await registry.call_tool(
        "content_discovery",
        urls=urls,
        scope_filter=state.program_scope,
    )
    tools_run = ["content_discovery"]
    if not result.get("success"):
        return {
            "success": False,
            "error": result.get("error"),
            "tools_run": tools_run,
            "interrupt_reason": f"Content discovery failed: {result.get('error')}",
        }

    endpoints = result["data"].get("endpoints", [])

    new_findings = [
        {
            "type": "endpoint",
            "source": "phase_4_content",
            "url": e["url"],
            "status_code": e.get("status_code"),
            "depth": e.get("depth", 0),
        }
        for e in endpoints
    ]

    updates = {
        "success": True,
        "error": None,
        "tools_run": tools_run,
        "findings": state.findings + new_findings,
        "endpoints": endpoints,
    }

    # Optional browser capture on priority targets when service is configured
    try:
        from rekonstrike.config import load_settings
        settings = load_settings()
        browser_url = getattr(settings, "browser_service_url", "")
        if browser_url:
            priority = state.strategy.get("priority_targets", [])
            capture_targets = [u for u in urls if any(p in u for p in priority)] if priority else urls[:3]
            if capture_targets:
                from rekonstrike.tools.browser_client import BrowserCaptureClient
                client = BrowserCaptureClient(
                    browser_url, token=getattr(settings, "browser_service_token", "")
                )
                browser_result = await client.capture_batch(capture_targets)
                if browser_result.get("success"):
                    updates["js_bundles"] = browser_result.get("js_bundles", [])
                    updates["source_maps"] = browser_result.get("source_maps", [])
                    updates["browser_captures"] = browser_result.get("captures", [])
                    tools_run.append("browser_capture")
    except Exception:
        logger.info("browser capture skipped", exc_info=True)

    return updates


@register_phase("phase_5_vulnscan", 5, "Vulnerability scanning — run Nuclei templates", ["phase_3_httpprobe"])
async def phase_5_vulnscan(state: ReconState, registry: ToolRegistry) -> dict:
    if not state.live_hosts:
        return {
            "success": False,
            "error": "no live hosts to scan",
            "tools_run": [],
            "interrupt_reason": "No live hosts — cannot run vulnerability scan",
        }

    urls = [h["url"] for h in state.live_hosts]

    # Include endpoints from phase_4_content if available
    prev_endpoints = state.phase_results.get("phase_4_content", {}).get("endpoints", [])
    if prev_endpoints:
        endpoint_urls = [e["url"] for e in prev_endpoints]
        urls = list(dict.fromkeys(urls + endpoint_urls))  # deduplicate preserving order

    # Build tech_stack map (url -> technologies)
    tech_map = {
        host["url"]: host.get("tech_stack", [])
        for host in state.live_hosts
        if "url" in host and host["url"]
    }

    result = await registry.call_tool(
        "vuln_scan",
        urls=urls,
        tech_stack=tech_map,
    )
    tools_run = ["vuln_scan"]
    if not result.get("success"):
        return {
            "success": False,
            "error": result.get("error"),
            "tools_run": tools_run,
            "interrupt_reason": f"Vulnerability scan failed: {result.get('error')}",
        }

    vulnerabilities = result["data"].get("vulnerabilities", [])

    # Add vulnerabilities as findings
    new_findings = [
        {
            "type": "vulnerability",
            "source": "phase_5_vulnscan",
            "template": v.get("template", ""),
            "name": v.get("name", ""),
            "severity": v.get("severity", "unknown"),
            "url": v.get("url", ""),
            "description": v.get("description", ""),
        }
        for v in vulnerabilities
    ]

    return {
        "success": True,
        "error": None,
        "tools_run": tools_run,
        "findings": state.findings + new_findings,
        "vulnerabilities": vulnerabilities,
    }


@register_phase("phase_6_scoring", 6, "ROI scoring — prioritize findings by impact", ["phase_5_vulnscan", "phase_4_content"])
async def phase_6_scoring(state: ReconState, registry: ToolRegistry) -> dict:
    from rekonstrike.scoring import Scorer

    if not state.live_hosts:
        return {
            "success": False,
            "error": "no hosts to score",
            "tools_run": [],
            "interrupt_reason": "No hosts to score",
        }

    # Build program context for bounty-aware scoring
    program = None
    pc = state.platform_context
    if pc:
        program = {
            "bounty_max": pc.get("bounty", {}).get("max") or pc.get("bounty_max"),
        }

    scored_hosts = []
    for host in state.live_hosts:
        score, signals = Scorer.score(host, program)
        scored_hosts.append({
            **host,
            "roi_score": score,
            "signals": signals,
        })

    scored_hosts.sort(key=lambda h: h["roi_score"], reverse=True)

    # Collect vulnerability summaries from phase_5 results
    vulns = state.phase_results.get("phase_5_vulnscan", {}).get("vulnerabilities", [])
    severity_counts = {}
    for v in vulns:
        sev = v.get("severity", "unknown")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    return {
        "success": True,
        "error": None,
        "tools_run": [],
        "scored_hosts": scored_hosts,
        "severity_summary": severity_counts,
        "top_host": scored_hosts[0]["url"] if scored_hosts else None,
    }
