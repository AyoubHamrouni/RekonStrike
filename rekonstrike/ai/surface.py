"""Attack surface analysis via AI — identifies patterns, anomalies, and high-value targets."""

import json
import logging

from .base import call_ai

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a senior bug bounty hunter analyzing a target's attack surface. "
    "Identify patterns, anomalies, and high-value targets. "
    "Respond with valid JSON only."
)

FALLBACK = {
    "anomalies": [],
    "technology_patterns": [],
    "recommended_focus": [],
    "surface_summary": "Analysis unavailable.",
}


def _build_user_prompt(hosts: list[dict], target: str) -> str:
    capped = hosts[:50]
    lines = [f"Target: {target}", f"Live hosts provided: {len(capped)}", ""]
    for i, h in enumerate(capped, 1):
        techs = h.get("technologies") or []
        if isinstance(techs, list):
            tech_str = ", ".join(techs[:8])
            if len(techs) > 8:
                tech_str += f" (+{len(techs) - 8} more)"
        else:
            tech_str = str(techs)[:120]
        lines.append(f"--- Host {i} ---")
        lines.append(f"URL: {h.get('url', 'N/A')}")
        lines.append(f"Status: {h.get('status_code', 'N/A')}")
        lines.append(f"Title: {h.get('title', 'N/A')}")
        lines.append(f"Technologies: {tech_str}")
        lines.append(f"ROI Score: {h.get('roi_score', 'N/A')}")
        lines.append(f"WAF: {h.get('waf_detected', False)}")
        lines.append("")
    lines.append(
        "Respond with a JSON object with these keys:\n"
        "- anomalies: max 5 items, each {\"url\": str, \"reason\": str}\n"
        "- technology_patterns: 3-5 string observations\n"
        "- recommended_focus: top 3, each {\"url\": str, \"rationale\": str}\n"
        "- surface_summary: 2-3 sentence string\n\n"
        "Return ONLY valid JSON. No markdown fences, no extra text."
    )
    return "\n".join(lines)


def _parse_response(raw: str) -> dict | None:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("AI surface response was not valid JSON: %s", raw[:200])
        return None
    if not isinstance(parsed, dict):
        logger.warning("AI surface response is not a dict: %s", type(parsed).__name__)
        return None
    return parsed


async def analyze_attack_surface(
    hosts: list[dict],
    target: str,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """Analyze live hosts and identify attack surface patterns via AI.

    Sends up to 50 hosts to the AI provider, then returns a structured
    analysis with anomalies, technology patterns, recommended focus
    areas, and a surface summary. On any parse failure or empty response
    the fallback dict is returned.
    """
    if not hosts:
        return dict(FALLBACK)

    user = _build_user_prompt(hosts, target)
    raw = await call_ai(SYSTEM_PROMPT, user, max_tokens=2000, provider=provider, model=model)

    if not raw:
        logger.info("AI surface analysis returned empty response — using fallback")
        return dict(FALLBACK)

    result = _parse_response(raw)
    if result is None:
        logger.warning("AI surface analysis parse failed — using fallback")
        return dict(FALLBACK)

    return result
