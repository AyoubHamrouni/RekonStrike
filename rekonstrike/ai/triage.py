"""Nuclei finding triage via AI — ranks findings by exploitability and filters noise."""

import json
import logging

from .base import call_ai

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a senior bug bounty hunter triaging Nuclei scanner output. "
    "Rank findings by actual exploitability and bounty value. "
    "Separate real findings from scanner noise. "
    "Respond with valid JSON only."
)


def _build_user_prompt(findings: list[dict], target_url: str) -> str:
    lines = [f"Target: {target_url}", f"Total findings: {len(findings)}", ""]
    for i, f in enumerate(findings, 1):
        lines.append(f"--- Finding {i} ---")
        lines.append(f"Name: {f.get('name', 'N/A')}")
        lines.append(f"Severity: {f.get('severity', 'N/A')}")
        lines.append(f"Template: {f.get('template_id', 'N/A')}")
        lines.append(f"Match: {f.get('matched_at', 'N/A')}")
        lines.append(f"Description: {f.get('description', 'N/A')}")
        lines.append("")
    lines.append(
        "Respond with a JSON array of objects. "
        "Each object must contain ALL original finding fields PLUS these triage fields:\n"
        "- priority_rank: int (1 = highest priority)\n"
        "- confidence: float 0.0–1.0\n"
        "- likely_false_positive: bool\n"
        "- triage_note: string (max 100 chars)\n\n"
        "Return ONLY valid JSON. No markdown fences, no extra text."
    )
    return "\n".join(lines)


def _parse_response(raw: str, findings: list[dict]) -> list[dict] | None:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("AI triage response was not valid JSON: %s", raw[:200])
        return None

    if not isinstance(parsed, list):
        logger.warning("AI triage response is not a list: %s", type(parsed).__name__)
        return None

    merged = []
    for i, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        original = dict(findings[i]) if i < len(findings) else {}
        merged.append({**original, **item})

    if not merged:
        return None

    merged.sort(key=lambda x: x.get("priority_rank", 999))
    return merged


async def triage_nuclei_findings(
    findings: list[dict],
    target_url: str,
    provider: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """Rank Nuclei findings by exploitability using AI triage.

    Sends findings to the AI provider, parses the ranked response, and
    returns the enriched list sorted by *priority_rank* (1 = highest).
    On any parse failure or empty response the original findings are
    returned with default triage fields attached.
    """
    if not findings:
        return []

    user = _build_user_prompt(findings, target_url)
    raw = await call_ai(SYSTEM_PROMPT, user, max_tokens=2000, provider=provider, model=model)

    if not raw:
        logger.info("AI triage returned empty response — using defaults")
        for f in findings:
            f.setdefault("confidence", 0.5)
            f.setdefault("likely_false_positive", False)
        return findings

    result = _parse_response(raw, findings)
    if result is None:
        logger.warning("AI triage parse failed — falling back to defaults")
        for f in findings:
            f.setdefault("confidence", 0.5)
            f.setdefault("likely_false_positive", False)
        return findings

    return result
