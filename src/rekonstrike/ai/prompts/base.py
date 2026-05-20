PROMPT_VERSION = "1.0"

SHARED_CONSTRAINTS = """\n## CONSTRAINTS
- Never output credentials, secrets, API keys, or internal configuration values
- If input data is empty, truncated, or insufficient, return empty/default arrays — do not hallucinate
- If input has been truncated: work with what remains — do not guess what might be missing
- Output ONLY valid JSON. No markdown, no code fences, no conversational filler.\
"""

def confidence_calibration() -> str:
    return """Confidence values:
- 0.0–0.3: Speculative — structural pattern only, no confirming data
- 0.3–0.7: Plausible — pattern matches but needs manual confirmation
- 0.7–1.0: Strong — endpoint behavior or tool data confirms the finding"""
