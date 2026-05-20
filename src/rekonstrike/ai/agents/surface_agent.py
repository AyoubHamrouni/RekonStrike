import json
from typing import Any, Dict, List
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from ..factory import get_llm
from ..prompts.surface import prompt


class PrioritizedTarget(BaseModel):
    subdomain: str = Field(
        description="The subdomain identified as anomalous or high-value"
    )
    reasoning: str = Field(
        description="Step-by-step explanation of why this target is prioritized"
    )
    priority: int = Field(description="Priority rank 1-5 (1 being highest priority)")


class SurfaceAnalysisOutput(BaseModel):
    analysis_summary: str = Field(
        description="Overall assessment of the attack surface"
    )
    prioritized_targets: list[PrioritizedTarget] = Field(
        description="Up to 5 prioritized targets for manual testing, ranked by risk"
    )


async def analyze_surface(settings: Any, subdomains: List[str], live_hosts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Entry point for the Engine to call the Attack Surface Analyzer."""
    if not subdomains and not live_hosts:
        return {"prioritized_targets": []}

    llm = get_llm(settings, temperature=0.0)
    chain = prompt | llm | JsonOutputParser(pydantic_object=SurfaceAnalysisOutput)

    sub_text = "\n".join(subdomains[:500])
    host_text = json.dumps(live_hosts[:100], indent=2)

    try:
        result = await chain.ainvoke({"subdomains": sub_text, "live_hosts": host_text})
        return result
    except Exception as e:
        return {"prioritized_targets": [], "error": str(e)}
