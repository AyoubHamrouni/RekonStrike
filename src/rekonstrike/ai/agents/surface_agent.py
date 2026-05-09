import json
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field


class AnomalousTarget(BaseModel):
    subdomain: str = Field(
        description="The subdomain identified as anomalous or high-value."
    )
    reasoning: str = Field(
        description="Step-by-step explanation of why this target matches the risk heuristics."
    )
    priority: int = Field(description="Priority rank 1-5 (1 being highest priority).")


class SurfaceAnalysisOutput(BaseModel):
    analysis_summary: str = Field(
        description="Overall assessment of the attack surface (e.g., 'Heavy reliance on AWS...')."
    )
    anomalous_targets: list[AnomalousTarget]


llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

system_prompt = (
    "You are an attack surface heuristic engine. Analyze the provided external footprint "
    "(subdomains and live hosts) to identify the top 5 high-value targets for immediate manual testing.\n\n"
    "Prioritize targets matching these risk heuristics:\n"
    "- Non-production environments (dev, stg, uat, test, beta).\n"
    "- Internal or administrative portals (admin, corp, int, portal, vpn).\n"
    "- Direct API endpoints (api-v1, graphql, swagger).\n"
    "- Legacy infrastructure (v1, old, legacy).\n\n"
    "CONSTRAINTS:\n"
    "- ONLY select targets that exist in the provided input data. Do not hallucinate URLs.\n"
    "- MUST provide exactly 5 targets, unless fewer than 5 exist in the dataset.\n"
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
