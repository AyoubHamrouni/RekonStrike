import json
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field


class TestSuggestion(BaseModel):
    test: str = Field(description="Short test name")
    reason: str = Field(description="Why this test matters for THIS specific host")
    specific_url: str = Field(
        description="A real URL from the provided list to target, if applicable"
    )
    payload_hint: str = Field(description="A concrete payload or technique to try")


class AdvisorOutput(BaseModel):
    suggestions: list[TestSuggestion]


llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

system_prompt = (
    "You are a senior bug bounty hunter giving specific, actionable testing advice. "
    "Be concrete — use the actual URLs and technology stack provided. "
    "All suggestions must reference the actual technology stack and URLs provided. No generic advice."
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

chain = prompt | llm | JsonOutputParser(pydantic_object=AdvisorOutput)


async def get_test_suggestions(
    host: dict, module: str, discovered_endpoints: list[str]
) -> list[dict]:
    """Entry point for the Engine to call the Testing Advisor."""
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
    except Exception as e:
        return []
