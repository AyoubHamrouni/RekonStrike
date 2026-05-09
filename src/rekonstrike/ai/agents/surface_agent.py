import json
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field


class AnomalousTarget(BaseModel):
    subdomain: str = Field(
        description="The subdomain identified as anomalous or high-value."
    )
    reason: str = Field(
        description="Why this target is interesting (e.g. 'Staging environment', 'Exposed admin panel')."
    )
    priority: int = Field(description="Priority rank 1-5 (1 being highest priority).")


class SurfaceAnalysisOutput(BaseModel):
    anomalous_targets: list[AnomalousTarget]


llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

system_prompt = (
    "You are a senior penetration tester analyzing an external attack surface. "
    "Given a list of discovered subdomains and live hosts, identify the top 5 most 'anomalous' "
    "or high-value targets that warrant manual investigation.\n"
    "Look for patterns indicating development, staging, internal tools, VPNs, or exposed APIs "
    "(e.g., 'dev.api', 'jira', 'staging', 'corp', 'v2').\n"
    "Respond with a JSON array of anomalous targets."
)

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", system_prompt),
        ("user", "Discovered Subdomains:\n{subdomains}\n\nLive Hosts:\n{live_hosts}"),
    ]
)

chain = prompt | llm | JsonOutputParser(pydantic_object=SurfaceAnalysisOutput)


async def analyze_surface(subdomains: list[str], live_hosts: list[dict]) -> dict:
    """Entry point for the Engine to call the Attack Surface Analyzer."""
    if not subdomains and not live_hosts:
        return {"anomalous_targets": []}

    # Cap inputs to prevent token limit issues
    sub_text = "\\n".join(subdomains[:500])
    host_text = json.dumps(live_hosts[:100], indent=2)

    try:
        result = await chain.ainvoke({"subdomains": sub_text, "live_hosts": host_text})
        return result
    except Exception as e:
        return {"anomalous_targets": [], "error": str(e)}
