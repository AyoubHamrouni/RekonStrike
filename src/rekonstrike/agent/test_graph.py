import pytest
from unittest.mock import patch, AsyncMock
import json
try:
    from langchain_core.messages import SystemMessage
except ImportError:
    class SystemMessage:
        def __init__(self, content):
            self.content = content

from rekonstrike.agent.state import ReconState
from rekonstrike.agent.graph import (
    input_node, agent_reasoning_node, tool_executor_node, 
    interrupt_node, build_graph
)

@pytest.mark.asyncio
async def test_recon_state_initialization():
    state = ReconState(target_domain="example.com", goal="find auth bypass")
    assert state.step_count == 0
    assert state.discovered_subdomains == []

@pytest.mark.asyncio
async def test_input_node():
    state = ReconState(target_domain="example.com", goal="find auth bypass")
    result = await input_node(state)
    assert result["step_count"] == 1
    assert "example.com" in result["program_scope"]["in_scope"]

@pytest.mark.asyncio
@patch('rekonstrike.agent.graph.get_llm')
async def test_agent_reasoning_node_valid_output(mock_get_llm):
    mock_resp = AsyncMock()
    mock_resp.content = '{"next_action": "passive_recon", "reasoning": "Need to find subdomains"}'
    mock_get_llm.return_value.ainvoke = AsyncMock(return_value=mock_resp)
    
    state = ReconState(target_domain="example.com", goal="find auth bypass", discovered_subdomains=["api.example.com"])
    result = await agent_reasoning_node(state)
    
    assert "next_action" in result
    assert result["next_action"] in ["passive_recon", "http_probe", "analyze", "interrupt", "stop"]
    assert result["next_action"] == "passive_recon"

@pytest.mark.asyncio
@patch('rekonstrike.agent.graph.get_llm')
async def test_graph_execution_path_passive_recon(mock_get_llm):
    resp1 = AsyncMock()
    resp1.content = '{"next_action": "passive_recon", "reasoning": "start"}'
    resp2 = AsyncMock()
    resp2.content = '{"next_action": "stop", "reasoning": "done"}'
    
    mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2])
    
    graph = build_graph()
    initial_state = {"target_domain": "example.com", "goal": "test"}
    
    final_state = await graph.ainvoke(initial_state)
    
    assert "passive_recon" in final_state["tools_tried"]

@pytest.mark.asyncio
@patch('rekonstrike.agent.graph.get_llm')
async def test_graph_execution_path_http_probe(mock_get_llm):
    resp1 = AsyncMock()
    resp1.content = '{"next_action": "http_probe", "reasoning": "probe"}'
    resp2 = AsyncMock()
    resp2.content = '{"next_action": "stop", "reasoning": "done"}'
    
    mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2])
    
    graph = build_graph()
    initial_state = {
        "target_domain": "example.com", 
        "goal": "test",
        "discovered_subdomains": ["api.example.com"]
    }
    
    final_state = await graph.ainvoke(initial_state)
    
    assert "http_probe" in final_state["tools_tried"]
    assert isinstance(final_state["live_hosts"], list)

@pytest.mark.asyncio
async def test_interrupt_node_execution():
    state = ReconState(target_domain="example.com", goal="test", next_action="interrupt", interrupt_reason="testing")
    result = await interrupt_node(state)
    assert result["interrupt_reason"] == "testing"
