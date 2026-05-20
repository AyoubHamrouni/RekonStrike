from typing import Any, Dict, List
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from ..factory import get_llm
from ..prompts.advisor import prompt


class TestSuggestion(BaseModel):
    test: str = Field(description="Short test name")
    reason: str = Field(description="Why this test matters for THIS specific host")
    specific_url: str = Field(
        description="A real URL from the provided list to target, if applicable"
    )
    payload_hint: str = Field(description="A concrete payload or technique to try")


class AdvisorOutput(BaseModel):
    tech_stack_analysis: str = Field(
        description="Brief chain-of-thought connecting the stack to potential vulnerability classes"
    )
    suggestions: list[TestSuggestion]


async def get_test_suggestions(
    settings: Any, host: Dict[str, Any], module: str, discovered_endpoints: List[str]
) -> List[Dict[str, Any]]:
    """Entry point for the Engine to call the Testing Advisor."""
    llm = get_llm(settings, temperature=0.0)
    chain = prompt | llm | JsonOutputParser(pydantic_object=AdvisorOutput)

    tech_stack = ", ".join(host.get("technologies", [])[:10])
    capped_endpoints = "\n".join(discovered_endpoints[:20])

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
            }
        )
        return result.get("suggestions", [])
    except Exception:
        return []
