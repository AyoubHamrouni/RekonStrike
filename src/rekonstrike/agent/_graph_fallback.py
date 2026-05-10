"""Minimal LangGraph mock for environments where langgraph is not installed."""

from .state import ReconState

START = "__start__"
END = "__end__"


def _route_from_reasoning(state: ReconState) -> str:
    action = state.next_action
    if action == "analyze":
        return "reasoning"
    elif action == "interrupt":
        return "interrupt"
    elif action == "stop":
        return "stop"
    else:
        return "executor"


def _route_from_executor(state: ReconState) -> str:
    if state.last_tool_result.get("success", False):
        return "reasoning"
    else:
        return "interrupt"


class StateGraph:
    def __init__(self, state_schema):
        self.nodes = {}
        self.edges = []
        self.conditional_edges = []

    def add_node(self, name, func):
        self.nodes[name] = func

    def add_edge(self, start, end):
        self.edges.append((start, end))

    def add_conditional_edges(self, start, router, mapping):
        self.conditional_edges.append((start, router, mapping))

    def compile(self):
        return self

    async def ainvoke(self, state, config=None):
        s_dict = state if isinstance(state, dict) else state.model_dump()
        s = ReconState(**s_dict)

        curr_node = "input"
        steps = 0
        limit = config.get("recursion_limit", 25) if config else 25

        while curr_node and curr_node != END and steps < limit:
            steps += 1
            if curr_node in self.nodes:
                updates = await self.nodes[curr_node](s)
                s = ReconState(**{**s.model_dump(), **updates})

            if curr_node == "input":
                curr_node = "reasoning"
            elif curr_node == "reasoning":
                curr_node = _route_from_reasoning(s)
            elif curr_node == "executor":
                curr_node = _route_from_executor(s)
            elif curr_node in ("interrupt", "stop"):
                curr_node = END
            else:
                curr_node = END

        return s.model_dump()
