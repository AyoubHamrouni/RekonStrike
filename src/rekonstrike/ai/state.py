from typing import Annotated, TypedDict, Sequence, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class TriageState(TypedDict):
    """State for the Triage Agent workflow."""

    messages: Annotated[Sequence[BaseMessage], add_messages]
    finding: dict
    target_url: str
    fetch_content_used: bool
    final_verdict: Optional[dict]


class SurfaceState(TypedDict):
    """State for the Attack Surface Analyzer workflow."""

    messages: Annotated[Sequence[BaseMessage], add_messages]
    subdomains: list[str]
    live_hosts: list[dict]
    anomalous_targets: list[dict]


class AdvisorState(TypedDict):
    """State for the Testing Advisor workflow."""

    messages: Annotated[Sequence[BaseMessage], add_messages]
    host_context: dict
    module: str
    endpoints: list[str]
    suggestions: list[dict]
