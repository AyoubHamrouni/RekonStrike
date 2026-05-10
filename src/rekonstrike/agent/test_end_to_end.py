import pytest
from unittest.mock import patch, AsyncMock
from rekonstrike.agent.runner import ReconAgentRunner
from rekonstrike.agent.state import ReconState


@pytest.mark.asyncio
@patch("rekonstrike.agent.graph.get_llm")
async def test_agent_e2e_basic_flow(mock_get_llm):
    resp1 = AsyncMock(content='{"next_action": "phase_1_passive", "reasoning": "start"}')
    resp2 = AsyncMock(content='{"next_action": "phase_3_httpprobe", "reasoning": "probe"}')
    resp3 = AsyncMock(content='{"next_action": "stop", "reasoning": "done"}')
    mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2, resp3])

    runner = ReconAgentRunner()
    result = await runner.run_reconnaissance(target_domain="example.com", goal="find endpoints")

    assert isinstance(result, ReconState)
    assert len(result.discovered_subdomains) > 0
    assert len(result.live_hosts) > 0
    assert result.step_count > 0
    assert "phase_1_passive" in result.phases_tried
    assert "phase_3_httpprobe" in result.phases_tried
    assert "passive_recon" in result.tools_tried
    assert "http_probe" in result.tools_tried


@pytest.mark.asyncio
@patch("rekonstrike.agent.graph.get_llm")
async def test_agent_e2e_respects_max_steps(mock_get_llm):
    mock_get_llm.return_value.ainvoke = AsyncMock(
        return_value=AsyncMock(content='{"next_action": "phase_1_passive", "reasoning": "keep going"}')
    )

    runner = ReconAgentRunner()
    result = await runner.run_reconnaissance(target_domain="example.com", max_steps=1)

    assert result.step_count <= 5


@pytest.mark.asyncio
@patch("rekonstrike.agent.graph.get_llm")
async def test_agent_e2e_respects_scope(mock_get_llm):
    resp1 = AsyncMock(content='{"next_action": "phase_1_passive", "reasoning": "start"}')
    resp2 = AsyncMock(content='{"next_action": "phase_3_httpprobe", "reasoning": "probe"}')
    resp3 = AsyncMock(content='{"next_action": "stop", "reasoning": "done"}')
    mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2, resp3])

    runner = ReconAgentRunner()
    scope = {"in_scope": ["api.example.com"], "out_of_scope": ["admin.example.com"]}
    result = await runner.run_reconnaissance(target_domain="example.com", program_scope=scope)

    for host in result.live_hosts:
        assert "api.example.com" in host["url"]
        assert "admin.example.com" not in host["url"]


@pytest.mark.asyncio
@patch("rekonstrike.agent.graph.get_llm")
@patch("rekonstrike.agent.tool_registry.ToolRegistry.call_tool")
async def test_agent_e2e_phase_failures_trigger_interrupt(mock_call, mock_get_llm):
    # Strategy says phase_1_passive; triage detects failure and decides to interrupt
    mock_get_llm.return_value.ainvoke = AsyncMock(
        side_effect=[
            AsyncMock(content='{"next_action": "phase_1_passive", "reasoning": "start"}'),
            AsyncMock(content='{"next_action": "interrupt", "reasoning": "phase failed, pausing"}'),
        ]
    )
    mock_call.return_value = {"success": False, "error": "simulated failure"}

    runner = ReconAgentRunner()
    result = await runner.run_reconnaissance(target_domain="example.com", max_steps=5)

    assert "simulated failure" in result.interrupt_reason
    assert result.next_action == "interrupt"


@pytest.mark.asyncio
@patch("rekonstrike.agent.graph.get_llm")
async def test_agent_e2e_state_continuity(mock_get_llm):
    resp1 = AsyncMock(content='{"next_action": "phase_1_passive", "reasoning": "start"}')
    resp2 = AsyncMock(content='{"next_action": "stop", "reasoning": "done"}')
    mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2])

    runner = ReconAgentRunner()
    result = await runner.run_reconnaissance(target_domain="example.com")

    assert len(result.discovered_subdomains) > 0
    assert any("api.example.com" in s for s in result.discovered_subdomains)
    assert "phase_1_passive" in result.phases_tried
