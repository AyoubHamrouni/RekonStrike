import json
import pytest
from unittest.mock import AsyncMock, patch

from rekonstrike.agent.state import ReconState
from rekonstrike.agent.graph import (
    input_node,
    strategy_node,
    pipeline_executor_node,
    triage_node,
    interrupt_node,
    stop_node,
    route_from_strategy,
    route_from_executor,
    route_from_triage,
    _parse_llm_json,
    _stop,
)


class TestHelpers:
    def test_parse_llm_json_plain(self):
        data = _parse_llm_json('{"next_action": "stop", "reasoning": "done"}')
        assert data["next_action"] == "stop"
        assert data["reasoning"] == "done"

    def test_parse_llm_json_with_codeblock(self):
        raw = 'Some text\n```json\n{"next_action": "phase_1_passive"}\n```\nmore'
        data = _parse_llm_json(raw)
        assert data["next_action"] == "phase_1_passive"

    def test_parse_llm_json_with_generic_block(self):
        raw = '```\n{"next_action": "stop"}\n```'
        data = _parse_llm_json(raw)
        assert data["next_action"] == "stop"

    def test_parse_llm_json_invalid(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            _parse_llm_json("not json")

    def test_stop(self):
        result = _stop("reason")
        assert result["next_action"] == "stop"
        assert result["reasoning"] == "reason"


class TestInputNode:
    @pytest.mark.asyncio
    async def test_increments_step_count(self):
        state = ReconState(target_domain="example.com", goal="test")
        result = await input_node(state)
        assert result["step_count"] == 1

    @pytest.mark.asyncio
    async def test_sets_default_scope_when_missing(self):
        state = ReconState(target_domain="example.com", goal="test")
        result = await input_node(state)
        assert "in_scope" in result["program_scope"]
        assert "example.com" in result["program_scope"]["in_scope"]

    @pytest.mark.asyncio
    async def test_preserves_existing_scope(self):
        state = ReconState(
            target_domain="example.com",
            goal="test",
            program_scope={"in_scope": ["api.example.com"]},
        )
        result = await input_node(state)
        assert result["program_scope"]["in_scope"] == ["api.example.com"]


class TestStrategyNode:
    @pytest.mark.asyncio
    async def test_stops_when_max_steps_reached(self):
        state = ReconState(target_domain="example.com", goal="test", step_count=11, max_steps=10)
        result = await strategy_node(state)
        assert result["next_action"] == "stop"
        assert "Max steps" in result["reasoning"]

    @pytest.mark.asyncio
    async def test_calls_llm_and_parses_response(self):
        mock_response = AsyncMock()
        mock_response.content = json.dumps({
            "next_action": "phase_1_passive",
            "reasoning": "start with passive recon",
            "strategy": {"focus_areas": ["api"], "depth_vs_breadth": "breadth"},
            "guidance": ["Starting passive recon"],
        })

        with patch("rekonstrike.agent.graph.get_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke.return_value = mock_response
            mock_get_llm.return_value = mock_llm

            state = ReconState(target_domain="example.com", goal="test")
            result = await strategy_node(state)
            assert result["next_action"] == "phase_1_passive"
            assert result["reasoning"] == "start with passive recon"
            assert result["strategy"]["focus_areas"] == ["api"]
            assert "Starting passive recon" in result["guidance"]

    @pytest.mark.asyncio
    async def test_fallback_on_llm_error(self):
        with patch("rekonstrike.agent.graph.get_llm") as mock_get_llm:
            mock_get_llm.side_effect = RuntimeError("LLM unavailable")
            state = ReconState(target_domain="example.com", goal="test")
            result = await strategy_node(state)
            assert result["next_action"] == "interrupt"
            assert "Failed" in result["reasoning"]


class TestPipelineExecutorNode:
    @pytest.mark.asyncio
    async def test_runs_phase_and_updates_state(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            next_action="phase_0_validate",
        )
        result = await pipeline_executor_node(state)
        assert result["step_count"] == state.step_count + 1
        assert "phase_0_validate" in result["phases_tried"]
        assert "phase_0_validate" in result["phase_results"]
        assert result["last_tool_result"]["success"] is True

    @pytest.mark.asyncio
    async def test_accumulates_subdomains(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            next_action="phase_1_passive",
        )
        result = await pipeline_executor_node(state)
        assert len(result.get("discovered_subdomains", [])) > 0

    @pytest.mark.asyncio
    async def test_handles_unknown_phase(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            next_action="phase_nonexistent",
        )
        result = await pipeline_executor_node(state)
        assert result["last_tool_result"]["success"] is False
        assert "interrupt_reason" in result


class TestTriageNode:
    @pytest.mark.asyncio
    async def test_stops_when_max_steps_reached(self):
        state = ReconState(target_domain="example.com", goal="test", step_count=11, max_steps=10)
        result = await triage_node(state)
        assert result["next_action"] == "stop"

    @pytest.mark.asyncio
    async def test_calls_llm_and_decides_next_action(self):
        mock_response = AsyncMock()
        mock_response.content = json.dumps({
            "next_action": "phase_3_httpprobe",
            "reasoning": "proceed to probing",
            "analysis": {"interesting_findings": ["subdomains found"], "key_insight": "good scope"},
            "guidance": ["Moving to probe phase"],
        })

        with patch("rekonstrike.agent.graph.get_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke.return_value = mock_response
            mock_get_llm.return_value = mock_llm

            state = ReconState(
                target_domain="example.com",
                goal="test",
                phases_tried=["phase_1_passive"],
                phase_results={"phase_1_passive": {"success": True, "data": {"subdomains": ["api.example.com"]}}},
            )
            result = await triage_node(state)
            assert result["next_action"] == "phase_3_httpprobe"
            assert "proceed" in result["reasoning"]
            assert any("Moving" in g for g in result["guidance"])

    @pytest.mark.asyncio
    async def test_fallback_on_llm_error(self):
        with patch("rekonstrike.agent.graph.get_llm") as mock_get_llm:
            mock_get_llm.side_effect = RuntimeError("LLM unavailable")
            state = ReconState(target_domain="example.com", goal="test")
            result = await triage_node(state)
            assert result["next_action"] == "interrupt"
            assert "Failed" in result["reasoning"]


class TestInterruptAndStopNodes:
    @pytest.mark.asyncio
    async def test_interrupt_node(self):
        state = ReconState(target_domain="example.com", goal="test", interrupt_reason="need input")
        result = await interrupt_node(state)
        assert result["interrupt_reason"] == "need input"

    @pytest.mark.asyncio
    async def test_stop_node_generates_summary(self):
        state = ReconState(
            target_domain="example.com",
            goal="test",
            phases_tried=["phase_1_passive", "phase_3_httpprobe"],
            discovered_subdomains=["api.example.com"],
            live_hosts=[{"url": "https://api.example.com"}],
            findings=[{"type": "endpoint"}],
        )
        result = await stop_node(state)
        assert len(result["guidance"]) > len(state.guidance)
        added = result["guidance"][-2:]
        assert any("Reconnaissance complete" in g for g in added)


class TestRouting:
    def test_route_from_strategy_to_executor(self):
        state = ReconState(target_domain="x.com", goal="test", next_action="phase_1_passive")
        assert route_from_strategy(state) == "executor"

    def test_route_from_strategy_to_interrupt(self):
        state = ReconState(target_domain="x.com", goal="test", next_action="interrupt")
        assert route_from_strategy(state) == "interrupt"

    def test_route_from_strategy_to_stop(self):
        state = ReconState(target_domain="x.com", goal="test", next_action="stop")
        assert route_from_strategy(state) == "stop"

    def test_route_from_executor_always_triage(self):
        state = ReconState(target_domain="x.com", goal="test")
        assert route_from_executor(state) == "triage"

    def test_route_from_triage_to_executor(self):
        state = ReconState(target_domain="x.com", goal="test", next_action="phase_4_content")
        assert route_from_triage(state) == "executor"

    def test_route_from_triage_to_strategy(self):
        state = ReconState(target_domain="x.com", goal="test", next_action="re_strategize")
        assert route_from_triage(state) == "strategy"

    def test_route_from_triage_to_interrupt(self):
        state = ReconState(target_domain="x.com", goal="test", next_action="interrupt")
        assert route_from_triage(state) == "interrupt"

    def test_route_from_triage_to_stop(self):
        state = ReconState(target_domain="x.com", goal="test", next_action="stop")
        assert route_from_triage(state) == "stop"
