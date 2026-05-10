import json
import pytest
from unittest.mock import patch, AsyncMock
try:
    from langchain_core.messages import SystemMessage
except ImportError:
    class SystemMessage:
        def __init__(self, content):
            self.content = content

from rekonstrike.agent.state import ReconState
from rekonstrike.agent.graph import (
    input_node, strategy_node, triage_node, interrupt_node, stop_node, build_graph
)


@pytest.mark.asyncio
async def test_recon_state_initialization():
    state = ReconState(target_domain="example.com", goal="find auth bypass")
    assert state.step_count == 0
    assert state.discovered_subdomains == []
    assert state.strategy == {}
    assert state.guidance == []
    assert state.phase_results == {}
    assert state.platform_context == {}


@pytest.mark.asyncio
async def test_input_node():
    state = ReconState(target_domain="example.com", goal="find auth bypass")
    result = await input_node(state)
    assert result["step_count"] == 1
    assert "example.com" in result["program_scope"]["in_scope"]


@pytest.mark.asyncio
@patch('rekonstrike.agent.graph.get_llm')
async def test_strategy_node_sets_strategy_and_guidance(mock_get_llm):
    mock_resp = AsyncMock()
    mock_resp.content = json.dumps({
        "next_action": "phase_1_passive",
        "reasoning": "Start with passive recon",
        "strategy": {
            "focus_areas": ["api"],
            "depth_vs_breadth": "breadth",
            "priority_targets": ["api.example.com"],
            "reasoning": "Broad coverage for this program",
        },
        "guidance": ["I will start with subdomain discovery."],
    })
    mock_get_llm.return_value.ainvoke = AsyncMock(return_value=mock_resp)

    state = ReconState(target_domain="example.com", goal="find auth bypass")
    result = await strategy_node(state)

    assert result["next_action"] == "phase_1_passive"
    assert result["strategy"]["focus_areas"] == ["api"]
    assert "I will start with subdomain discovery." in result["guidance"]


@pytest.mark.asyncio
@patch('rekonstrike.agent.graph.get_llm')
async def test_triage_node_produces_guidance(mock_get_llm):
    mock_resp = AsyncMock()
    mock_resp.content = json.dumps({
        "next_action": "phase_3_httpprobe",
        "reasoning": "Now probe discovered subdomains",
        "analysis": {
            "interesting_findings": ["admin.example.com found"],
            "key_insight": "admin panel exposed",
        },
        "guidance": ["Found admin.example.com — this is worth investigating."],
    })
    mock_get_llm.return_value.ainvoke = AsyncMock(return_value=mock_resp)

    state = ReconState(
        target_domain="example.com",
        goal="find endpoints",
        discovered_subdomains=["admin.example.com"],
        phases_tried=["phase_1_passive"],
        phase_results={"phase_1_passive": {"success": True}},
    )
    result = await triage_node(state)

    assert result["next_action"] == "phase_3_httpprobe"
    assert any("Found admin.example.com" in g for g in result["guidance"])


@pytest.mark.asyncio
@patch('rekonstrike.agent.graph.get_llm')
async def test_graph_execution_path_passive_recon(mock_get_llm):
    resp1 = AsyncMock()
    resp1.content = '{"next_action": "phase_1_passive", "reasoning": "start"}'
    resp2 = AsyncMock()
    resp2.content = '{"next_action": "stop", "reasoning": "done"}'

    mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2])

    graph = build_graph()
    initial_state = {"target_domain": "example.com", "goal": "test"}

    final_state = await graph.ainvoke(initial_state)

    assert "phase_1_passive" in final_state["phases_tried"]
    assert "passive_recon" in final_state["tools_tried"]
    assert "phase_1_passive" in final_state.get("phase_results", {})


@pytest.mark.asyncio
@patch('rekonstrike.agent.graph.get_llm')
async def test_graph_execution_path_http_probe(mock_get_llm):
    resp1 = AsyncMock()
    resp1.content = '{"next_action": "phase_3_httpprobe", "reasoning": "probe"}'
    resp2 = AsyncMock()
    resp2.content = '{"next_action": "stop", "reasoning": "done"}'

    mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2])

    graph = build_graph()
    initial_state = {
        "target_domain": "example.com",
        "goal": "test",
        "discovered_subdomains": ["api.example.com"],
    }

    final_state = await graph.ainvoke(initial_state)

    assert "phase_3_httpprobe" in final_state["phases_tried"]
    assert "http_probe" in final_state["tools_tried"]
    assert isinstance(final_state["live_hosts"], list)
    assert "phase_3_httpprobe" in final_state.get("phase_results", {})


@pytest.mark.asyncio
async def test_interrupt_node_execution():
    state = ReconState(
        target_domain="example.com", goal="test", next_action="interrupt", interrupt_reason="testing"
    )
    result = await interrupt_node(state)
    assert result["interrupt_reason"] == "testing"


@pytest.mark.asyncio
async def test_stop_node_produces_guidance():
    state = ReconState(
        target_domain="example.com",
        goal="test",
        discovered_subdomains=["api.example.com"],
        live_hosts=[{"url": "http://api.example.com"}],
        findings=[{"name": "test"}],
        phases_tried=["phase_1_passive"],
        guidance=["Previous guidance"],
    )
    result = await stop_node(state)
    assert len(result["guidance"]) > 0
    assert "Previous guidance" in result["guidance"]
    assert any("Reconnaissance complete" in g for g in result["guidance"])


@pytest.mark.asyncio
async def test_guidance_accumulates_across_nodes():
    state = ReconState(
        target_domain="example.com",
        goal="test",
        guidance=["Initial guidance"],
    )
    stop_result = await stop_node(state)
    assert "Initial guidance" in stop_result["guidance"]
    assert len(stop_result["guidance"]) > 1
