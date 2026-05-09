"""Bug report drafting via AI — produces platform-formatted reports."""

import logging

from .base import call_ai

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a professional bug bounty hunter writing a detailed vulnerability "
    "report for submission. Follow the exact format requested. Be precise, "
    "technical, and actionable."
)


def _build_user_prompt(vuln: dict, host: dict, platform: str) -> str:
    lines = [
        f"Platform: {platform}",
        f"Target URL: {host.get('url', 'N/A')}",
        f"Page Title: {host.get('title', 'N/A')}",
        f"Technology Stack: {host.get('technologies', 'N/A')}",
        "",
        f"Vulnerability: {vuln.get('name', 'N/A')}",
        f"Severity: {vuln.get('severity', 'medium')}",
        f"Template ID: {vuln.get('template_id', 'N/A')}",
        f"Matched At: {vuln.get('matched_at', 'N/A')}",
        f"Description: {vuln.get('description', 'N/A')}",
        f"Curl Command: {vuln.get('curl_command', 'N/A')}",
        "",
        "Write a bug report using this exact format:",
        "",
        "Vulnerability: {title}",
        "Severity: {severity}",
        "Summary: [2-3 sentence description of the vulnerability and its impact]",
        "Steps to Reproduce:",
        "",
        "[specific step with actual URL]",
        "[specific step]",
        "...",
        "",
        "Impact: [concrete impact — what can an attacker do?]",
        "Remediation: [specific fix recommendation]",
        "",
        "Return the formatted string directly (not JSON).",
        "If you cannot generate a report, return the template with [FILL IN] markers.",
    ]
    return "\n".join(lines)


async def draft_bug_report(
    vuln: dict,
    host: dict,
    platform: str = "HackerOne",
    provider: str | None = None,
    model: str | None = None,
) -> str:
    user = _build_user_prompt(vuln, host, platform)
    raw = await call_ai(SYSTEM_PROMPT, user, max_tokens=1500, provider=provider, model=model)
    if not raw:
        logger.info("AI report returned empty — using placeholder")
        return _placeholder_report(vuln, host)
    return raw


def _placeholder_report(vuln: dict, host: dict) -> str:
    url = host.get("url", "[URL]")
    name = vuln.get("name", "[Vulnerability Name]")
    severity = vuln.get("severity", "medium")
    desc = vuln.get("description", "[Description]")
    curl = vuln.get("curl_command", "[No curl command available]")
    return (
        f"Vulnerability: {name}\n"
        f"Severity: {severity}\n"
        f"Summary: [FILL IN — 2-3 sentence description of the vulnerability and its impact]\n"
        f"Steps to Reproduce:\n\n"
        f"1. Navigate to {url}\n"
        f"2. [FILL IN — specific step]\n"
        f"3. [FILL IN — specific step]\n\n"
        f"Curl command for reproduction:\n{curl}\n\n"
        f"Impact: [FILL IN — concrete impact]\n"
        f"Remediation: [FILL IN — specific fix recommendation]\n"
    )
