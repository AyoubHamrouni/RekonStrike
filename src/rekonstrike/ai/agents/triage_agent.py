import json
from typing import Literal, Any, Dict
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START
from langgraph.prebuilt import ToolNode

from ..state import TriageState
from ..tools import fetch_http_snippet
from ..factory import get_llm
from ..prompts.triage import SYSTEM_PROMPT as TRIAGE_SYSTEM_PROMPT



def _build_triage_graph(settings: Any):
    llm = get_llm(settings, temperature=0.0)
    tools = [fetch_http_snippet]
    llm_with_tools = llm.bind_tools(tools)

    async def evaluate_finding(state: TriageState):
        finding = state["finding"]

        if not state.get("messages"):
            user_prompt = f"Target URL: {state['target_url']}\nFinding Data:\n{json.dumps(finding, indent=2)}"
            messages = [
                SystemMessage(content=TRIAGE_SYSTEM_PROMPT),
                HumanMessage(content=user_prompt),
            ]
        else:
            messages = [SystemMessage(content=TRIAGE_SYSTEM_PROMPT)] + list(state["messages"])

        response = await llm_with_tools.ainvoke(messages)
        return {"messages": [response]}

    def should_continue(state: TriageState) -> Literal["tools", "__end__"]:
        messages = state["messages"]
        last_message = messages[-1]

        if last_message.tool_calls:
            return "tools"

        try:
            content = last_message.content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
            verdict = json.loads(content)
            state["final_verdict"] = verdict
        except Exception:
            state["final_verdict"] = {
                "reasoning_steps": ["Failed to parse AI output."],
                "priority_rank": 999,
                "confidence": 0.5,
                "likely_false_positive": False,
                "triage_note": "AI parse failure",
            }

        return "__end__"

    workflow = StateGraph(TriageState)
    workflow.add_node("evaluate", evaluate_finding)
    tool_node = ToolNode(tools)
    workflow.add_node("tools", tool_node)
    
    workflow.add_edge(START, "evaluate")
    workflow.add_conditional_edges("evaluate", should_continue)
    workflow.add_edge("tools", "evaluate")
    
    return workflow.compile()

async def run_triage(settings: Any, finding: Dict[str, Any], target_url: str) -> Dict[str, Any]:
    """Entry point for the Engine to call the Triage Agent."""
    triage_graph = _build_triage_graph(settings)
    
    initial_state = {
        "messages": [],
        "finding": finding,
        "target_url": target_url,
        "fetch_content_used": False,
        "final_verdict": None,
    }

    final_state = await triage_graph.ainvoke(initial_state)

    verdict = final_state.get("final_verdict")
    if not verdict:
        verdict = {
            "reasoning_steps": ["Execution failed or yielded no verdict."],
            "priority_rank": 999,
            "confidence": 0.5,
            "likely_false_positive": False,
            "triage_note": "Unknown Error",
        }

    return {**finding, **verdict}
