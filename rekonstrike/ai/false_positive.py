"""False positive detection via AI — classifies findings by likelihood of being real."""

import json
import logging

from .base import call_ai

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a senior bug bounty hunter validating Nuclei scanner findings. "
    "Classify each finding as true positive or false positive based on the "
    "description, matched URL, and context. Respond with valid JSON only."
)


def _build_user_prompt(findings: list[dict], target_url: str) -> str:
    lines = [f"Target: {target_url}", f"Total findings: {len(findings)}", ""]
    for i, f in enumerate(findings, 1):
        lines.append(f"--- Finding {i} ---")
        lines.append(f"Name: {f.get('name', 'N/A')}")
        lines.append(f"Template: {f.get('template_id', 'N/A')}")
        lines.append(f"Severity: {f.get('severity', 'N/A')}")
        lines.append(f"Matched At: {f.get('matched_at', 'N/A')}")
        lines.append(f"URL: {f.get('url', 'N/A')}")
        lines.append(f"Description: {f.get('description', 'N/A')}")
        lines.append("")
    lines.append(
        "Respond with a JSON array of objects. "
        "Each object must have:\n"
        "- name: str (original finding name)\n"
        "- template_id: str (original template_id)\n"
        "- fp_score: float 0.0–1.0 (0.0 = definitely false positive, 1.0 = definitely real)\n"
        "- reasoning: str (one sentence explanation)\n\n"
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
        logger.warning("AI FP-filter response was not valid JSON: %s", raw[:200])
        return None
    if not isinstance(parsed, list):
        logger.warning("AI FP-filter response is not a list: %s", type(parsed).__name__)
        return None
    merged = []
    for i, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        original = dict(findings[i]) if i < len(findings) else {}
        merged.append({**original, **item})
    if not merged:
        return None
    merged.sort(key=lambda x: x.get("fp_score", 0.5))
    return merged


async def filter_false_positives(
    findings: list[dict],
    target_url: str,
    provider: str | None = None,
    model: str | None = None,
) -> list[dict]:
    if not findings:
        return []
    user = _build_user_prompt(findings, target_url)
    raw = await call_ai(
        SYSTEM_PROMPT, user, max_tokens=2000, provider=provider, model=model
    )
    if not raw:
        logger.info("AI FP-filter returned empty — using defaults")
        for f in findings:
            f.setdefault("fp_score", 0.5)
        return findings
    result = _parse_response(raw, findings)
    if result is None:
        logger.warning("AI FP-filter parse failed — using defaults")
        for f in findings:
            f.setdefault("fp_score", 0.5)
        return findings
    return result
