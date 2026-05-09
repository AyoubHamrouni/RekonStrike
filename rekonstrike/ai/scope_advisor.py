"""Scope coverage analysis via AI — classifies assets against program scope rules."""

import json
import logging

from .base import call_ai

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a bug bounty program analyst. Analyze scope coverage and "
    "asset classification. Respond with valid JSON only."
)


def _build_user_prompt(scope: dict, discovered: list[str]) -> str:
    in_scope = scope.get("in_scope", [])
    out_of_scope = scope.get("out_of_scope", [])
    bounty_max = scope.get("bounty_max", "Unknown")
    capped = discovered[:100]

    lines = [
        f"Program: {scope.get('platform', 'Unknown')}",
        f"Max Bounty: ${bounty_max}",
        "",
        "In-Scope Patterns:",
    ]
    for s in in_scope:
        lines.append(f"  - {s}")
    lines.append("")
    lines.append("Out-of-Scope Patterns:")
    for s in out_of_scope:
        lines.append(f"  - {s}")
    lines.append("")
    lines.append(f"Discovered Assets (showing {len(capped)} of {len(discovered)}):")
    for a in capped:
        lines.append(f"  - {a}")
    lines.append("")
    lines.append(
        "Respond with a JSON object with these keys:\n"
        '- "in_scope_confirmed": [str] — discovered assets that clearly match in-scope rules\n'
        '- "out_of_scope_flagged": [str] — discovered assets that match out-of-scope rules\n'
        '- "unclear": [str] — ambiguous assets needing human review\n'
        '- "coverage_note": str — 1-2 sentences on scope coverage quality\n'
        '- "high_value": [str] — in-scope assets likely to pay highest bounty\n\n'
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
        logger.warning("AI scope response was not valid JSON: %s", raw[:200])
        return None
    if not isinstance(parsed, dict):
        logger.warning("AI scope response is not a dict: %s", type(parsed).__name__)
        return None
    return parsed


_FALLBACK = {
    "in_scope_confirmed": [],
    "out_of_scope_flagged": [],
    "unclear": [],
    "coverage_note": "Scope analysis unavailable.",
    "high_value": [],
}


async def analyze_scope_coverage(
    program_scope: dict,
    discovered_assets: list[str],
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    if not discovered_assets:
        return dict(_FALLBACK)
    user = _build_user_prompt(program_scope, discovered_assets)
    raw = await call_ai(SYSTEM_PROMPT, user, max_tokens=2000, provider=provider, model=model)
    if not raw:
        logger.info("AI scope analysis returned empty — using fallback")
        return dict(_FALLBACK)
    result = _parse_response(raw)
    if result is None:
        logger.warning("AI scope analysis parse failed — using fallback")
        return dict(_FALLBACK)
    return result
