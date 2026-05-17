from typing import Any, Dict, List
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from ..factory import get_llm

class TestSuggestion(BaseModel):
    test: str = Field(description="Short test name")
    reason: str = Field(description="Why this test matters for THIS specific host")
    specific_url: str = Field(
        description="A real URL from the provided list to target, if applicable"
    )
    payload_hint: str = Field(description="A concrete payload or technique to try")


class AdvisorOutput(BaseModel):
    tech_stack_analysis: str = Field(
        description="Brief CoT reasoning connecting the stack to potential vulnerability classes."
    )
    suggestions: list[TestSuggestion]


system_prompt = (
    "You are an expert manual testing advisor. Generate targeted, actionable attack vectors based on the "
    "provided live host footprint and testing module.\n\n"
    "Process:\n"
    "1. Analyze the Technology Stack. (e.g., If Java/Spring is detected, prioritize Spring4Shell or Java deserialization).\n"
    "2. Analyze the Endpoints. Match attack vectors to specific URLs (e.g., map SSRF payloads to `?url=` parameters).\n"
    "3. Adjust for WAF. If a WAF is present, suggest bypass techniques (e.g., JSON encoding, unicode evasion).\n\n"
    "CONSTRAINTS:\n"
    "- NEVER suggest generic payloads (e.g., `<script>alert(1)</script>` or `' OR 1=1--`).\n"
    "- ONLY suggest payloads that are highly relevant to the provided `tech_stack`.\n"
    "- Provide concrete endpoints from the `discovered_endpoints` list in your suggestions.\n"
)

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", system_prompt),
        (
            "user",
            "Host URL: {host_url}\n"
            "Page Title: {title}\n"
            "Status Code: {status_code}\n"
            "Technology Stack: {tech_stack}\n"
            "WAF: {waf_detected}\n"
            "Testing Module: {module}\n\n"
            "Discovered Endpoints:\n{endpoints}\n\n"
            "Focus on: {hint}",
        ),
    ]
)

async def get_test_suggestions(
    settings: Any, host: Dict[str, Any], module: str, discovered_endpoints: List[str]
) -> List[Dict[str, Any]]:
    """Entry point for the Engine to call the Testing Advisor."""
    llm = get_llm(settings, temperature=0.0)
    chain = prompt | llm | JsonOutputParser(pydantic_object=AdvisorOutput)

    tech_stack = ", ".join(host.get("technologies", [])[:10])
    capped_endpoints = "\\n".join(discovered_endpoints[:20])

    module_hints = {
        "auth": "authentication, authorization, session management, OAuth, JWTs",
        "injection": "SQLi, XSS, SSTI, command injection, SSRF, XXE, path traversal",
        "logic": "business logic flaws, race conditions, IDOR, price manipulation, mass assignment",
        "infra": "SSRF, cloud metadata, CORS, open redirect, file upload bypass, TLS weaknesses",
    }
    hint = module_hints.get(module, module)

    try:
        result = await chain.ainvoke(
            {
                "host_url": host.get("url", "N/A"),
                "title": host.get("title", "N/A"),
                "status_code": host.get("status_code", "N/A"),
                "tech_stack": tech_stack,
                "waf_detected": host.get("waf_detected", False),
                "module": module,
                "endpoints": capped_endpoints,
                "hint": hint,
            }
        )
        return result.get("suggestions", [])
    except Exception:
        return []
