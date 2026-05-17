import json
from typing import Literal, Any, Dict
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START
from langgraph.prebuilt import ToolNode

from ..state import TriageState
from ..tools import fetch_http_snippet

from ..factory import get_llm



def _build_triage_graph(settings: Any):
    llm = get_llm(settings, temperature=0.0)
    tools = [fetch_http_snippet]
    llm_with_tools = llm.bind_tools(tools)

    async def evaluate_finding(state: TriageState):
        finding = state["finding"]

        system_prompt = (
            "You are an automated triage engine for an offensive security pipeline. "
            "Evaluate the provided vulnerability finding against the target URL.\n\n"
            "Follow these steps precisely:\n"
            "1. Analyze the finding data. Is it a known generic signature (e.g., a default 404 page falsely flagged as an information disclosure)?\n"
            "2. If necessary, use the `fetch_http_snippet` tool to pull the live DOM/Headers to verify the claim.\n"
            "3. Formulate your reasoning step-by-step.\n\n"
            "CONSTRAINTS:\n"
            "- DO NOT assume a finding is valid just because the scanner flagged it. Be highly skeptical.\n"
            "- DO NOT invent evidence. If you cannot confirm via tools, state that confidence is low.\n"
            "- DO NOT wrap your output in markdown formatting (no ```json).\n\n"
            "Output strictly in this JSON schema:\n"
            "{\n"
            '  "reasoning_steps": [\n'
            '    "Step 1: Analyzed scanner output...",\n'
            '    "Step 2: Confirmed..."\n'
            '  ],\n'
            '  "likely_false_positive": bool,\n'
            '  "confidence": 0.0-1.0,\n'
            '  "priority_rank": 1-5,\n'
            '  "triage_note": "Concise technical justification."\n'
            "}"
        )

        if not state.get("messages"):
            user_prompt = f"Target URL: {state['target_url']}\nFinding Data:\n{json.dumps(finding, indent=2)}"
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
        else:
            messages = [SystemMessage(content=system_prompt)] + list(state["messages"])

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
        # Fallback
        verdict = {
            "reasoning_steps": ["Execution failed or yielded no verdict."],
            "priority_rank": 999,
            "confidence": 0.5,
            "likely_false_positive": False,
            "triage_note": "Unknown Error",
        }

    # Merge verdict into original finding
    return {**finding, **verdict}
