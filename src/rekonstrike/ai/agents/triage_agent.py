import json
from typing import Literal
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from ..state import TriageState
from ..tools import fetch_http_snippet

# Define the LLM
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# Bind tools
tools = [fetch_http_snippet]
llm_with_tools = llm.bind_tools(tools)


# Node: Evaluator
async def evaluate_finding(state: TriageState):
    finding = state["finding"]

    system_prompt = (
        "You are a senior bug bounty hunter triaging a Nuclei finding. "
        "Your goal is to determine if this finding is a false positive and assign a priority rank.\n"
        "You may use the `fetch_http_snippet` tool if you need to manually inspect the live HTTP response "
        "to confirm the vulnerability (e.g. checking if a leaked secret is actually present, or if it's a 404 page).\n"
        "If you have enough information or have already used tools, output a final JSON block in this exact format "
        "(do NOT use markdown fences around the JSON):\n"
        "{\n"
        '  "priority_rank": 1-5,\n'
        '  "confidence": 0.0-1.0,\n'
        '  "likely_false_positive": bool,\n'
        '  "triage_note": "short explanation"\n'
        "}"
    )

    # If this is the first execution, provide the initial finding context
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


# Conditional routing
def should_continue(state: TriageState) -> Literal["tools", "__end__"]:
    messages = state["messages"]
    last_message = messages[-1]

    # If the LLM makes a tool call, route to the tools node
    if last_message.tool_calls:
        return "tools"

    # Otherwise, attempt to parse the final JSON verdict
    try:
        content = last_message.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
        verdict = json.loads(content)
        state["final_verdict"] = verdict
    except Exception:
        # Fallback if parsing fails
        state["final_verdict"] = {
            "priority_rank": 999,
            "confidence": 0.5,
            "likely_false_positive": False,
            "triage_note": "AI parse failure",
        }

    return "__end__"


# Build the Graph
workflow = StateGraph(TriageState)

workflow.add_node("evaluate", evaluate_finding)
tool_node = ToolNode(tools)
workflow.add_node("tools", tool_node)

workflow.add_edge(START, "evaluate")
workflow.add_conditional_edges("evaluate", should_continue)
workflow.add_edge("tools", "evaluate")

triage_graph = workflow.compile()


async def run_triage(finding: dict, target_url: str) -> dict:
    """Entry point for the Engine to call the Triage Agent."""
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
            "priority_rank": 999,
            "confidence": 0.5,
            "likely_false_positive": False,
            "triage_note": "Unknown Error",
        }

    # Merge verdict into original finding
    return {**finding, **verdict}
