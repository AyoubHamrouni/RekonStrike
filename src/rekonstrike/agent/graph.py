import json
import logging
try:
    from langgraph.graph import StateGraph, START, END
except ImportError:
    # Minimal mock for LangGraph if not installed
    class StateGraph:
        def __init__(self, state_schema):
            self.nodes = {}
            self.edges = []
        def add_node(self, name, func):
            self.nodes[name] = func
        def add_edge(self, start, end):
            self.edges.append((start, end))
        def add_conditional_edges(self, start, router, mapping):
            pass
        def compile(self):
            return self
        async def ainvoke(self, state, config=None):
            # Mock graph execution loop
            s_dict = state if isinstance(state, dict) else state.model_dump()
            s = ReconState(**s_dict)
            
            curr_node = "input"
            steps = 0
            limit = config.get("recursion_limit", 25) if config else 25
            
            while curr_node and curr_node != "__end__" and steps < limit:
                steps += 1
                if curr_node in self.nodes:
                    updates = await self.nodes[curr_node](s)
                    s = ReconState(**{**s.model_dump(), **updates})
                
                # Routing logic
                if curr_node == "input":
                    curr_node = "reasoning"
                elif curr_node == "reasoning":
                    action = s.next_action
                    if action in ["passive_recon", "http_probe"]:
                        curr_node = "executor"
                    elif action == "analyze":
                        curr_node = "reasoning"
                    elif action == "interrupt":
                        curr_node = "interrupt"
                    elif action == "stop":
                        curr_node = "stop"
                    else:
                        curr_node = "__end__"
                elif curr_node == "executor":
                    if s.last_tool_result.get("success", False):
                        curr_node = "reasoning"
                    else:
                        curr_node = "interrupt"
                elif curr_node in ["interrupt", "stop"]:
                    curr_node = "__end__"
                else:
                    curr_node = "__end__"
                    
            return s.model_dump()
    START = "__start__"
    END = "__end__"

try:
    from langchain_core.messages import SystemMessage
except ImportError:
    class SystemMessage:
        def __init__(self, content):
            self.content = content

try:
    from rekonstrike.ai.factory import get_llm
    from rekonstrike.config import load_settings
except ImportError:
    # Minimal mocks for restricted environments
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

from .state import ReconState
from .tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

async def input_node(state: ReconState) -> dict:
    logger.info(f"Starting reconnaissance for {state.target_domain} with goal: {state.goal}")
    scope = state.program_scope
    if not scope:
        scope = {"in_scope": [state.target_domain], "out_of_scope": []}
        
    return {
        "step_count": state.step_count + 1,
        "program_scope": scope
    }

async def agent_reasoning_node(state: ReconState) -> dict:
    # Use load_settings to pick up env vars if not provided elsewhere
    settings = load_settings()
    
    prompt = f"""You are an autonomous bug bounty recon agent. Your job is to decide what reconnaissance 
action to take next based on what you've already discovered.

Current state:
- Target: {state.target_domain}
- Goal: {state.goal}
- Discovered so far: {len(state.discovered_subdomains)} subdomains, {len(state.live_hosts)} live hosts
- Tools already tried: {state.tools_tried}
- In-scope assets: {state.program_scope.get('in_scope', [])}

You have these tools available:
- passive_recon: discovers subdomains via external sources
- http_probe: probes targets to find live hosts and tech stack

Decide your next action. Respond ONLY with valid JSON (no markdown, no explanation):
{{
  "next_action": "passive_recon" | "http_probe" | "analyze" | "interrupt" | "stop",
  "reasoning": "why you chose this action (1 sentence)",
  "action_params": {{}}
}}
"""
    try:
        llm = get_llm(settings, temperature=0.0)
        response = await llm.ainvoke([SystemMessage(content=prompt)])
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        parsed = json.loads(content)
        next_action = parsed.get("next_action", "interrupt")
        reasoning = parsed.get("reasoning", "")
    except Exception as e:
        logger.error(f"LLM parsing failed: {e}")
        next_action = "interrupt"
        reasoning = "Failed to parse LLM response"
    
    return {
        "next_action": next_action,
        "reasoning": reasoning,
        "step_count": state.step_count + 1
    }

async def tool_executor_node(state: ReconState) -> dict:
    registry = ToolRegistry()
    tool_name = state.next_action
    
    kwargs = {}
    if tool_name == "passive_recon":
        kwargs = {"target": state.target_domain}
    elif tool_name == "http_probe":
        kwargs = {"targets": state.discovered_subdomains, "scope_filter": state.program_scope}
        
    result = await registry.call_tool(tool_name, **kwargs)
    
    updates = {
        "last_tool_result": result,
        "tools_tried": state.tools_tried + [tool_name]
    }
    
    if not result.get("success"):
        updates["next_action"] = "interrupt"
        updates["interrupt_reason"] = f"Tool {tool_name} failed: {result.get('error')}"
    else:
        if tool_name == "passive_recon":
            new_subs = result["data"].get("subdomains", [])
            updates["discovered_subdomains"] = list(set(state.discovered_subdomains + new_subs))
        elif tool_name == "http_probe":
            new_hosts = result["data"].get("probed", [])
            updates["live_hosts"] = state.live_hosts + new_hosts
            
    return updates

async def interrupt_node(state: ReconState) -> dict:
    logger.info(f"Agent requests human input: {state.interrupt_reason}")
    return {"interrupt_reason": state.interrupt_reason}

async def stop_node(state: ReconState) -> dict:
    logger.info(f"{len(state.live_hosts)} live hosts found, {len(state.findings)} findings")
    return {}

def route_from_reasoning(state: ReconState) -> str:
    action = state.next_action
    if action in ["passive_recon", "http_probe"]:
        return "executor"
    elif action == "analyze":
        return "reasoning"
    elif action == "interrupt":
        return "interrupt"
    elif action == "stop":
        return "stop"
    else:
        return "interrupt"

def route_from_executor(state: ReconState) -> str:
    if state.last_tool_result.get("success", False):
        return "reasoning"
    else:
        return "interrupt"

def build_graph():
    graph = StateGraph(ReconState)
    
    graph.add_node("input", input_node)
    graph.add_node("reasoning", agent_reasoning_node)
    graph.add_node("executor", tool_executor_node)
    graph.add_node("interrupt", interrupt_node)
    graph.add_node("stop", stop_node)
    
    graph.add_edge(START, "input")
    graph.add_edge("input", "reasoning")
    
    graph.add_conditional_edges("reasoning", route_from_reasoning, {
        "executor": "executor",
        "reasoning": "reasoning",
        "interrupt": "interrupt",
        "stop": "stop"
    })
    
    graph.add_conditional_edges("executor", route_from_executor, {
        "reasoning": "reasoning",
        "interrupt": "interrupt"
    })
    
    graph.add_edge("interrupt", END)
    graph.add_edge("stop", END)
    
    return graph.compile()

compiled_graph = build_graph()
