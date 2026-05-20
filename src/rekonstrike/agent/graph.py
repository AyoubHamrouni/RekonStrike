"""Agent graph — LangGraph StateGraph with strategist + triager + phase pipeline.

Architecture:
  START → input → strategy (LLM: "what's our approach?")
                → executor (deterministic phase)
                → triage (LLM: "what did we find?")
                → executor → triage → ... → synthesis → stop

The LLM plays TWO distinct cognitive roles:
  1. Strategist  — runs once at start (or at major pivots), analyzes program
     context, sets focus areas and priority targets, explains strategy to user.
  2. Triager     — runs after every phase, interprets results through a bug
     bounty lens, decides next action, explains findings to user.

Neither decides individual tool calls — phases handle that deterministically."""

import json
import logging
from functools import lru_cache

from .state import ReconState
from .phases import run_phase, list_phases

try:
    from langgraph.graph import StateGraph, START, END
except ImportError:
    from ._graph_fallback import StateGraph, START, END  # noqa: F401

try:
    from langchain_core.messages import SystemMessage
except ImportError:
    class SystemMessage:
        def __init__(self, content):
            self.content = content

try:
    from rekonstrike.ai.factory import get_llm
    from rekonstrike.config import load_settings
    from rekonstrike.ai.prompts.strategist import SYSTEM_PROMPT as STRATEGIST_PROMPT
    from rekonstrike.ai.prompts.triager import SYSTEM_PROMPT as TRIAGER_PROMPT
except ImportError:
    def get_llm(settings, **kwargs):
        class MockLLM:
            async def ainvoke(self, messages):
                class Response:
                    content = '{"next_action": "stop", "reasoning": "Mock LLM active"}'
                return Response()
        return MockLLM()
    def load_settings():
        class MockSettings:
            ai_provider = "mock"
            default_ai_model = "mock"
            ai_api_keys = {}
            ai_base_urls = {}
            api_keys = {}
        return MockSettings()
    STRATEGIST_PROMPT = ""
    TRIAGER_PROMPT = ""

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────


def _parse_llm_json(content: str) -> dict:
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM JSON response: %s", e)
        raise ValueError("Invalid JSON response from LLM") from e


def _safe_json(value, max_chars: int = 12000) -> str:
    text = json.dumps(value, indent=2, default=str)
    if len(text) > max_chars:
        return text[:max_chars] + "\n... truncated ..."
    return text


def _validated_next_action(action: str, fallback: str = "interrupt") -> str:
    allowed = {p["name"] for p in list_phases()} | {
        "interrupt",
        "stop",
        "re_strategize",
    }
    return action if action in allowed else fallback


# ── Nodes ──────────────────────────────────────────────────────────────────


async def input_node(state: ReconState) -> dict:
    logger.info(f"Starting reconnaissance for {state.target_domain} with goal: {state.goal}")
    scope = state.program_scope
    if not scope:
        scope = {"in_scope": [state.target_domain], "out_of_scope": []}
    return {"step_count": state.step_count + 1, "program_scope": scope}


async def strategy_node(state: ReconState) -> dict:
    """Analyze program context, set strategy, and decide first phase."""
    if state.step_count > state.max_steps:
        return _stop("Max steps reached before strategy could be set")

    settings = load_settings()

    prompt = STRATEGIST_PROMPT.format(
        target_domain=state.target_domain,
        goal=state.goal,
        platform_context=_safe_json(state.platform_context) if state.platform_context else "No platform data available — operating with default scope.",
        in_scope=state.program_scope.get("in_scope", []),
        out_of_scope=state.program_scope.get("out_of_scope", []),
        phases_tried=state.phases_tried or "none yet",
    )

    try:
        llm = get_llm(settings, temperature=0.0)
        response = await llm.ainvoke([SystemMessage(content=prompt)])
        parsed = _parse_llm_json(response.content)
        next_action = _validated_next_action(parsed.get("next_action", "interrupt"))
        reasoning = parsed.get("reasoning", "")
        strategy = parsed.get("strategy", {})
        guidance = parsed.get("guidance", [])
    except Exception as e:
        logger.error(f"Strategy LLM failed: {e}")
        next_action = "interrupt"
        reasoning = "Failed to set strategy"
        strategy = {}
        guidance = ["I encountered an error while planning the reconnaissance strategy."]

    return {
        "next_action": next_action,
        "reasoning": reasoning,
        "strategy": strategy,
        "guidance": state.guidance + guidance,
        "step_count": state.step_count + 1,
    }


async def pipeline_executor_node(state: ReconState) -> dict:
    """Run the selected phase and store detailed results."""
    action = state.next_action
    result = await run_phase(action, state)

    updates = {
        "last_tool_result": result,
        "tools_tried": state.tools_tried + result.get("tools_run", [action]),
        "phases_tried": state.phases_tried + [action],
        "phase_results": {**state.phase_results, action: result},
        "step_count": state.step_count + 1,
    }

    if result.get("success", False):
        if "discovered_subdomains" in result:
            updates["discovered_subdomains"] = result["discovered_subdomains"]
        if "live_hosts" in result:
            updates["live_hosts"] = result["live_hosts"]
        if "program_scope" in result:
            updates["program_scope"] = result["program_scope"]
    else:
        updates["interrupt_reason"] = result.get(
            "interrupt_reason", f"Phase {action} failed: {result.get('error', 'unknown error')}"
        )

    return updates


async def triage_node(state: ReconState) -> dict:
    """Interpret the last phase results, produce guidance, decide next action."""
    if state.step_count > state.max_steps:
        return _stop("Max steps reached during triage")

    settings = load_settings()

    last_phase = state.phases_tried[-1] if state.phases_tried else None
    last_result = state.phase_results.get(last_phase, {}) if last_phase else {}

    prompt = TRIAGER_PROMPT.format(
        target_domain=state.target_domain,
        goal=state.goal,
        last_phase=last_phase or "none",
        phase_result=_safe_json(last_result) if last_result else "No results yet.",
        subdomain_count=len(state.discovered_subdomains),
        host_count=len(state.live_hosts),
        finding_count=len(state.findings),
        phases_tried=state.phases_tried or "none",
        strategy_json=_safe_json(state.strategy) if state.strategy else "Not set.",
    )

    try:
        llm = get_llm(settings, temperature=0.0)
        response = await llm.ainvoke([SystemMessage(content=prompt)])
        parsed = _parse_llm_json(response.content)
        next_action = _validated_next_action(parsed.get("next_action", "stop"), fallback="stop")
        reasoning = parsed.get("reasoning", "")
        guidance = parsed.get("guidance", [])
    except Exception as e:
        logger.error(f"Triage LLM failed: {e}")
        next_action = "interrupt"
        reasoning = "Failed to triage results"
        guidance = ["I encountered an error while analyzing results."]

    return {
        "next_action": next_action,
        "reasoning": reasoning,
        "guidance": state.guidance + guidance,
    }


async def interrupt_node(state: ReconState) -> dict:
    logger.info(f"Agent requests human input: {state.interrupt_reason}")
    return {"interrupt_reason": state.interrupt_reason}


async def stop_node(state: ReconState) -> dict:
    summary = (
        f"Reconnaissance complete for {state.target_domain}. "
        f"Ran {len(state.phases_tried)} phases, "
        f"found {len(state.discovered_subdomains)} subdomains, "
        f"{len(state.live_hosts)} live hosts, "
        f"{len(state.findings)} findings."
    )
    logger.info(summary)
    return {
        "guidance": state.guidance + [
            summary,
            "Review the findings in the dashboard for detailed analysis.",
        ]
    }


def _stop(reason: str) -> dict:
    return {
        "next_action": "stop",
        "reasoning": reason,
        "step_count": 0,
    }


# ── Routing ────────────────────────────────────────────────────────────────


def route_from_strategy(state: ReconState) -> str:
    action = state.next_action
    if action and action.startswith("phase_"):
        return "executor"
    if action == "interrupt":
        return "interrupt"
    return "stop"


def route_from_executor(state: ReconState) -> str:
    return "triage"


def route_from_triage(state: ReconState) -> str:
    action = state.next_action
    if action == "re_strategize":
        return "strategy"
    if action and action.startswith("phase_"):
        return "executor"
    if action == "interrupt":
        return "interrupt"
    return "stop"


# ── Graph Builder ──────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def build_graph():
    graph = StateGraph(ReconState)

    graph.add_node("input", input_node)
    graph.add_node("strategy", strategy_node)
    graph.add_node("executor", pipeline_executor_node)
    graph.add_node("triage", triage_node)
    graph.add_node("interrupt", interrupt_node)
    graph.add_node("stop", stop_node)

    graph.add_edge(START, "input")
    graph.add_edge("input", "strategy")

    graph.add_conditional_edges("strategy", route_from_strategy, {
        "executor": "executor",
        "interrupt": "interrupt",
        "stop": "stop",
    })

    graph.add_edge("executor", "triage")

    graph.add_conditional_edges("triage", route_from_triage, {
        "executor": "executor",
        "strategy": "strategy",
        "interrupt": "interrupt",
        "stop": "stop",
    })

    graph.add_edge("interrupt", END)
    graph.add_edge("stop", END)

    return graph.compile()


compiled_graph = build_graph()
