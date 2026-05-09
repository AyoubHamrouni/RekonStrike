"""Module-specific testing suggestions via AI — concrete, actionable advice per host."""

import json
import logging

from .base import call_ai

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a senior bug bounty hunter giving specific, actionable testing advice. "
    "Be concrete — use the actual URLs and technology stack provided. "
    "Respond with valid JSON only."
)


def _build_user_prompt(host: dict, module: str, endpoints: list[str]) -> str:
    techs = host.get("technologies") or []
    tech_str = ", ".join(techs[:10]) if isinstance(techs, list) else str(techs)[:200]

    capped = endpoints[:20]
    ep_lines = "\n".join(f"  - {e}" for e in capped)
    if len(endpoints) > 20:
        ep_lines += f"\n  ... (+{len(endpoints) - 20} more)"

    lines = [
        f"Host URL: {host.get('url', 'N/A')}",
        f"Page Title: {host.get('title', 'N/A')}",
        f"Status Code: {host.get('status_code', 'N/A')}",
        f"Technology Stack: {tech_str}",
        f"WAF: {host.get('waf_detected', False)}",
        f"ROI Score: {host.get('roi_score', 'N/A')}",
        "",
        f"Testing Module: {module}",
        "",
        f"Discovered Endpoints ({len(capped)} shown):",
        ep_lines,
        "",
    ]

    module_hints = {
        "auth": "authentication, authorization, session management, OAuth, JWTs",
        "injection": "SQLi, XSS, SSTI, command injection, SSRF, XXE, path traversal",
        "logic": "business logic flaws, race conditions, IDOR, price manipulation, mass assignment",
        "infra": "SSRF, cloud metadata, CORS, open redirect, file upload bypass, TLS weaknesses",
    }
    hint = module_hints.get(module, module)
    lines.append(f"Focus on: {hint}")
    lines.append("")
    lines.append(
        "Respond with a JSON array of at most 5 suggestion objects. "
        "Each object must have:\n"
        "- test: str (short test name)\n"
        "- reason: str (why this test matters for THIS specific host)\n"
        "- specific_url: str or null (a real URL from the provided list to target)\n"
        "- payload_hint: str or null (a concrete payload or technique to try)\n\n"
        "CRITICAL: All suggestions must reference the actual technology stack and "
        "URLs provided. No generic advice.\n\n"
        "Return ONLY valid JSON. No markdown fences, no extra text."
    )
    return "\n".join(lines)


def _parse_response(raw: str) -> list | None:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("AI advisor response was not valid JSON: %s", raw[:200])
        return None
    if not isinstance(parsed, list):
        logger.warning("AI advisor response is not a list: %s", type(parsed).__name__)
        return None
    return parsed[:5]


async def get_test_suggestions(
    host: dict,
    module: str,
    discovered_endpoints: list[str],
    provider: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """Get concrete, module-specific testing suggestions for a single host.

    Sends the host's tech stack, URL, and discovered endpoints to the AI
    provider and returns up to 5 actionable test suggestions. Returns an
    empty list on any failure.
    """
    user = _build_user_prompt(host, module, discovered_endpoints or [])
    raw = await call_ai(
        SYSTEM_PROMPT, user, max_tokens=1500, provider=provider, model=model
    )

    if not raw:
        logger.info("AI advisor returned empty response")
        return []

    result = _parse_response(raw)
    if result is None:
        logger.warning("AI advisor parse failed")
        return []

    return result
