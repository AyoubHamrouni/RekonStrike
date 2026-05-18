import asyncio
import logging
import random
import time
import re
import os
from datetime import datetime
from .tools_base import ToolBase

logger = logging.getLogger(__name__)


def _get_tool_runner(settings=None):
    from rekonstrike.runner import ToolRunner
    from rekonstrike.config import load_settings
    return ToolRunner(settings or load_settings())


def _tool_timeout() -> int:
    from rekonstrike.config import load_settings
    return load_settings().tool_timeout


async def _run_subfinder(target: str) -> list[str] | None:
    # Prefer mock data unless explicit env var enables real external tools.
    if os.environ.get("RS_USE_REAL_TOOLS", "") != "1":
        return None

    try:
        from rekonstrike.tools.wrappers import Subfinder

        runner = _get_tool_runner()
        if not runner.is_available("subfinder"):
            return None
        tool = Subfinder(runner)
        subs = await asyncio.wait_for(
            tool.enumerate(target), timeout=_tool_timeout()
        )
        if subs:
            logger.info(f"subfinder: {len(subs)} subdomains for {target}")
            return subs
    except asyncio.TimeoutError:
        logger.info(f"subfinder timed out after {_tool_timeout()}s for {target}")
    except Exception as e:
        logger.warning(f"subfinder failed: {e}")
    return None


async def _run_httpx(targets: list[str]) -> list[dict] | None:
    # Prefer mock data unless explicit env var enables real external tools.
    if os.environ.get("RS_USE_REAL_TOOLS", "") != "1":
        return None

    try:
        from rekonstrike.tools.wrappers import Httpx

        runner = _get_tool_runner()
        if not runner.is_available("httpx"):
            return None
        tool = Httpx(runner)
        stdin_data = "\n".join(targets)
        result = await asyncio.wait_for(
            tool.probe(stdin_data), timeout=_tool_timeout()
        )
        probed = []
        for line in result.json_lines():
            url = line.get("url", "")
            if not url:
                continue
            status_code = line.get("status_code", 0)
            if isinstance(status_code, str):
                status_code = int(status_code) if status_code.isdigit() else 0
            probed.append({
                "url": url,
                "status_code": status_code,
                "title": line.get("title"),
                "tech_stack": line.get("tech", []),
                "response_time_ms": line.get("response_time_ms"),
                "content_length": line.get("content_length"),
                "webserver": line.get("webserver"),
            })
        if probed:
            logger.info(f"httpx: {len(probed)} live hosts from {len(targets)} targets")
            return probed
    except asyncio.TimeoutError:
        logger.info(f"httpx timed out after {_tool_timeout()}s for {len(targets)} targets")
    except Exception as e:
        logger.warning(f"httpx failed: {e}")
    return None


def _mock_subdomains(target: str) -> list[str]:
    return [f"api.{target}", f"admin.{target}", f"mail.{target}"]


def _mock_probed(targets: list[str], in_scope_patterns: list[str], out_of_scope_patterns: list[str]) -> list[dict]:
    probed = []
    for target in targets:
        in_scope = True
        if in_scope_patterns:
            in_scope = any(p in target for p in in_scope_patterns)
        if in_scope and out_of_scope_patterns:
            in_scope = not any(p in target for p in out_of_scope_patterns)
        if not in_scope:
            continue
        rand_val = random.random()
        if rand_val < 0.2:
            continue  # unreachable
        elif rand_val < 0.6:
            probed.append({
                "url": target, "status_code": 200, "title": "Dashboard",
                "tech_stack": ["Django", "Python"], "response_time_ms": random.randint(50, 500),
            })
        elif rand_val < 0.8:
            probed.append({
                "url": target, "status_code": 403, "title": None,
                "tech_stack": [], "response_time_ms": random.randint(50, 500),
            })
        elif rand_val < 0.95:
            probed.append({
                "url": target, "status_code": 404, "title": "Not Found",
                "tech_stack": [], "response_time_ms": random.randint(50, 500),
            })
        else:
            probed.append({
                "url": target, "status_code": 500, "title": "Error",
                "tech_stack": [], "response_time_ms": random.randint(50, 500),
            })
    return probed


class PassiveReconTool(ToolBase):
    name = "passive_recon"
    description = "Gathers passive recon data from external sources (DNS, certificate transparency, etc)."

    async def execute(self, target: str, max_results: int = 500) -> dict:
        start_time = time.time()

        subdomains = await _run_subfinder(target)
        if subdomains is None:
            logger.info("subfinder not available, using mock data")
            subdomains = _mock_subdomains(target)

        subdomains = subdomains[:max_results]

        duration = time.time() - start_time
        return {
            "success": True,
            "data": {
                "subdomains": subdomains,
                "discovered_at": datetime.now().isoformat(),
            },
            "error": None,
            "duration_seconds": round(duration, 2),
        }

    async def validate_input(self, target: str, **kwargs) -> tuple[bool, str]:
        if not re.match(r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$", target):
            return False, "invalid domain"
        return True, ""


class HttpProbeTool(ToolBase):
    name = "http_probe"
    description = "Probes discovered targets to determine which are live and get basic metadata."

    async def execute(
        self,
        targets: list[str],
        scope_filter: dict = None,
        timeout_per_target: int = 5,
    ) -> dict:
        start_time = time.time()

        in_scope_patterns = scope_filter.get("in_scope", []) if scope_filter else []
        out_of_scope_patterns = scope_filter.get("out_of_scope", []) if scope_filter else []

        # Try real httpx first
        probed = await _run_httpx(targets)
        if probed is not None:
            # Apply scope filter to real results
            probed = [
                h for h in probed
                if _in_scope(h["url"], in_scope_patterns, out_of_scope_patterns)
            ]
        else:
            logger.info("httpx not available, using mock data")
            probed = _mock_probed(targets, in_scope_patterns, out_of_scope_patterns)

        duration = time.time() - start_time
        return {
            "success": True,
            "data": {
                "probed": probed,
                "live_count": len(probed),
                "filtered_out": len(targets) - len(probed),
            },
            "error": None,
            "duration_seconds": round(duration, 2),
        }

    async def validate_input(self, targets: list[str], **kwargs) -> tuple[bool, str]:
        if not targets:
            return False, "targets must be non-empty list"
        if not all(isinstance(t, str) for t in targets):
            return False, "targets must be list of strings"
        return True, ""


def _in_scope(url: str, in_patterns: list[str], out_patterns: list[str]) -> bool:
    if in_patterns:
        if not any(p in url for p in in_patterns):
            return False
    if out_patterns:
        if any(p in url for p in out_patterns):
            return False
    return True


# ─── Content Discovery (Katana) ──────────────────────────────────────

_MOCK_ENDPOINTS = [
    "/admin", "/api/v1", "/api/v2", "/api/v3", "/login", "/dashboard",
    "/wp-admin", "/wp-json", "/wp-content", "/.env", "/robots.txt",
    "/sitemap.xml", "/backup", "/config", "/health", "/status",
    "/graphql", "/swagger/v1", "/swagger/v2", "/api-docs",
    "/.git/config", "/.git/HEAD", "/.aws/credentials",
    "/crossdomain.xml", "/client-access-policy.xml",
    "/server-status", "/server-info", "/phpinfo.php",
    "/debug", "/console", "/actuator", "/actuator/health",
    "/actuator/info", "/actuator/env", "/actuator/beans",
    "/.well-known/security.txt",
]

_MOCK_TEMPLATE_SIGNALS = {
    "django": {"templates": ["django-debug-enabled", "django-secret-key"], "severity": "high"},
    "wordpress": {"templates": ["wordpress-user-enum", "xmlrpc-enabled"], "severity": "medium"},
    "laravel": {"templates": ["laravel-debug-enabled", "laravel-env-exposure"], "severity": "high"},
    "next.js": {"templates": ["nextjs-sourcemap", "nextjs-debug"], "severity": "medium"},
    "spring": {"templates": ["spring-actuator-exposure", "spring-boot-env-exposure"], "severity": "critical"},
    "tomcat": {"templates": ["tomcat-manager-exposure", "tomcat-examples"], "severity": "high"},
    "jenkins": {"templates": ["jenkins-script-console", "jenkins-unauthenticated"], "severity": "critical"},
    "phpmyadmin": {"templates": ["phpmyadmin-exposure"], "severity": "high"},
    "grafana": {"templates": ["grafana-unauthenticated", "grafana-dashboard-exposure"], "severity": "medium"},
    "elasticsearch": {"templates": ["elasticsearch-exposure"], "severity": "high"},
}


async def _run_katana(urls: list[str]) -> list[dict] | None:
    try:
        from rekonstrike.tools.wrappers import Katana
        runner = _get_tool_runner()
        if not runner.is_available("katana"):
            return None
        tool = Katana(runner)
        all_endpoints = []
        for url in urls:
            result = await asyncio.wait_for(
                tool.crawl(url, depth=2, concurrency=5), timeout=_tool_timeout()
            )
            for line in result.json_lines():
                all_endpoints.append({
                    "url": line.get("url", ""),
                    "source_url": url,
                    "depth": line.get("depth", 0),
                    "status_code": line.get("status-code", 0),
                })
        if all_endpoints:
            logger.info(f"katana: {len(all_endpoints)} endpoints from {len(urls)} URLs")
            return all_endpoints
    except asyncio.TimeoutError:
        logger.info(f"katana timed out after {_tool_timeout()}s for {len(urls)} URLs")
    except Exception as e:
        logger.warning(f"katana failed: {e}")
    return None


async def _run_nuclei(urls: list[str]) -> list[dict] | None:
    try:
        from rekonstrike.tools.wrappers import Nuclei
        runner = _get_tool_runner()
        if not runner.is_available("nuclei"):
            return None
        tool = Nuclei(runner)
        stdin_data = "\n".join(urls)
        result = await asyncio.wait_for(
            tool.scan(stdin_data), timeout=_tool_timeout()
        )
        vulns = []
        for line in result.json_lines():
            vulns.append({
                "template": line.get("template-id", ""),
                "name": line.get("info", {}).get("name", ""),
                "severity": line.get("info", {}).get("severity", "unknown"),
                "url": line.get("matched-at", ""),
                "description": line.get("info", {}).get("description", ""),
                "tags": line.get("info", {}).get("tags", []),
            })
        if vulns:
            logger.info(f"nuclei: {len(vulns)} findings from {len(urls)} targets")
            return vulns
    except asyncio.TimeoutError:
        logger.info(f"nuclei timed out after {_tool_timeout()}s for {len(urls)} targets")
    except Exception as e:
        logger.warning(f"nuclei failed: {e}")
    return None


def _mock_endpoints(urls: list[str]) -> list[dict]:
    endpoints = []
    for url in urls:
        chosen = random.sample(_MOCK_ENDPOINTS, min(random.randint(2, 6), len(_MOCK_ENDPOINTS)))
        for path in chosen:
            status = 200
            if path in ("/.git/config", "/.git/HEAD", "/.aws/credentials", "/.env"):
                status = 200 if random.random() < 0.3 else 403
            elif path in ("/admin", "/dashboard", "/wp-admin", "/console"):
                status = 200 if random.random() < 0.2 else 403
            endpoints.append({
                "url": url.rstrip("/") + path,
                "source_url": url,
                "depth": 1,
                "status_code": status,
            })
    return endpoints


def _mock_vulns(urls: list[str], tech_map: dict[str, list[str]]) -> list[dict]:
    vulns = []
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

    for url in urls:
        techs = tech_map.get(url, [])
        matched_templates = set()
        for tech in techs:
            tl = tech.lower()
            for keyword, mapping in _MOCK_TEMPLATE_SIGNALS.items():
                if keyword in tl:
                    for tpl in mapping["templates"]:
                        matched_templates.add((tpl, mapping["severity"]))

        if not matched_templates:
            matched_templates = {("generic-info-disclosure", "low")}

        for tpl, sev in matched_templates:
            if random.random() < 0.7:
                continue  # not every host has every vuln
            vulns.append({
                "template": tpl,
                "name": tpl.replace("-", " ").title(),
                "severity": sev,
                "url": url,
                "description": f"Potential {sev} severity issue detected: {tpl.replace('-', ' ')}",
                "tags": [sev, "mock"],
            })

    vulns.sort(key=lambda v: severity_order.get(v["severity"], 99))
    return vulns


# ─── Content Discovery Tool ──────────────────────────────────────────


class ContentDiscoveryTool(ToolBase):
    name = "content_discovery"
    description = "Discovers web endpoints and hidden paths via crawling and fuzzing."

    async def execute(
        self,
        urls: list[str],
        scope_filter: dict | None = None,
    ) -> dict:
        start_time = time.time()

        in_patterns = scope_filter.get("in_scope", []) if scope_filter else []
        out_patterns = scope_filter.get("out_of_scope", []) if scope_filter else []

        endpoints = await _run_katana(urls)
        if endpoints is None:
            logger.info("katana not available, using mock endpoint data")
            endpoints = _mock_endpoints(urls)

        endpoints = [
            e for e in endpoints
            if _in_scope(e["url"], in_patterns, out_patterns)
        ]

        duration = time.time() - start_time
        return {
            "success": True,
            "data": {
                "endpoints": endpoints,
                "count": len(endpoints),
            },
            "error": None,
            "duration_seconds": round(duration, 2),
        }

    async def validate_input(self, urls: list[str], **kwargs) -> tuple[bool, str]:
        if not urls:
            return False, "urls must be non-empty list"
        if not all(isinstance(t, str) for t in urls):
            return False, "urls must be list of strings"
        return True, ""


# ─── Vulnerability Scan Tool ─────────────────────────────────────────


class VulnScanTool(ToolBase):
    name = "vuln_scan"
    description = "Scans live hosts for known vulnerabilities using Nuclei templates."

    async def execute(
        self,
        urls: list[str],
        tech_stack: dict[str, list[str]] | None = None,
    ) -> dict:
        start_time = time.time()

        vulns = await _run_nuclei(urls)
        if vulns is None:
            logger.info("nuclei not available, using mock vuln data")
            vulns = _mock_vulns(urls, tech_stack or {})

        duration = time.time() - start_time
        return {
            "success": True,
            "data": {
                "vulnerabilities": vulns,
                "count": len(vulns),
            },
            "error": None,
            "duration_seconds": round(duration, 2),
        }

    async def validate_input(self, urls: list[str], **kwargs) -> tuple[bool, str]:
        if not urls:
            return False, "urls must be non-empty list"
        return True, ""
