import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from rekonstrike.agent.runner import ReconAgentRunner
from rekonstrike.agent.state import ReconState
from rekonstrike.config import Settings


@pytest.fixture
def settings():
    return Settings(database_url="postgresql+asyncpg://u:p@localhost/db")


class TestBuildInitialState:
    @pytest.mark.asyncio
    async def test_basic_state(self, settings):
        runner = ReconAgentRunner(settings)
        state = await runner._build_initial_state(
            target_domain="example.com",
            goal="find vulns",
            program_scope=None,
            platform=None,
            program_handle=None,
            max_steps=10,
        )
        assert state["target_domain"] == "example.com"
        assert state["goal"] == "find vulns"
        assert state["program_scope"] == {}
        assert state["platform_context"] == {}
        assert state["max_steps"] == 10

    @pytest.mark.asyncio
    async def test_includes_program_scope(self, settings):
        runner = ReconAgentRunner(settings)
        state = await runner._build_initial_state(
            target_domain="example.com",
            goal="test",
            program_scope={"in_scope": ["example.com"], "out_of_scope": []},
            platform=None,
            program_handle=None,
            max_steps=10,
        )
        assert state["program_scope"]["in_scope"] == ["example.com"]

    @pytest.mark.asyncio
    async def test_platform_context_is_empty_without_platform(self, settings):
        runner = ReconAgentRunner(settings)
        state = await runner._build_initial_state(
            target_domain="example.com",
            goal="test",
            program_scope=None,
            platform="hackerone",
            program_handle=None,
            max_steps=10,
        )
        # No handle = no platform data
        assert state["platform_context"] == {}


class TestRunReconnaissance:
    @pytest.mark.asyncio
    async def test_executes_graph_and_returns_state(self, settings):
        """Mock the entire graph and verify Runner orchestrates correctly."""
        mock_response = AsyncMock()
        mock_response.content = json.dumps({
            "next_action": "stop",
            "reasoning": "mock complete",
            "strategy": {},
            "guidance": ["mock guidance"],
        })

        final_state = {
            "target_domain": "example.com",
            "goal": "find vulns",
            "step_count": 3,
            "phases_tried": ["phase_0_validate", "phase_1_passive"],
            "discovered_subdomains": ["api.example.com"],
            "live_hosts": [{"url": "https://api.example.com"}],
            "findings": [],
            "guidance": ["mock guidance"],
            "strategy": {},
            "platform_context": {},
            "program_scope": {},
            "next_action": "stop",
            "reasoning": "done",
            "phase_results": {},
            "tools_tried": ["passive_recon"],
            "interrupt_reason": "",
            "last_tool_result": {},
            "started_at": "2026-01-01T00:00:00",
            "max_steps": 10,
            "step_count": 3,
        }

        with patch("rekonstrike.agent.runner.compiled_graph") as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=final_state)

            runner = ReconAgentRunner(settings)
            result = await runner.run_reconnaissance(
                target_domain="example.com",
                goal="find vulns",
                verbose=False,
            )

            assert isinstance(result, ReconState)
            assert result.target_domain == "example.com"
            assert result.step_count == 3
            assert "phase_0_validate" in result.phases_tried
            assert result.discovered_subdomains == ["api.example.com"]

    @pytest.mark.asyncio
    async def test_handles_graph_execution_error(self, settings):
        with patch("rekonstrike.agent.runner.compiled_graph") as mock_graph:
            mock_graph.ainvoke.side_effect = RuntimeError("graph failed")

            runner = ReconAgentRunner(settings)
            result = await runner.run_reconnaissance(
                target_domain="example.com",
                goal="test",
                verbose=False,
            )

            assert isinstance(result, ReconState)
            assert result.target_domain == "example.com"

    @pytest.mark.asyncio
    async def test_full_pipeline_with_mocked_llm(self, settings):
        """Integration-style test: mock the LLM but let the graph run real nodes."""
        resp_strategy = AsyncMock()
        resp_strategy.content = json.dumps({
            "next_action": "phase_1_passive",
            "reasoning": "start with passive",
            "strategy": {"focus_areas": ["api"], "depth_vs_breadth": "breadth"},
            "guidance": ["Starting passive recon"],
        })

        resp_triage = AsyncMock()
        resp_triage.content = json.dumps({
            "next_action": "stop",
            "reasoning": "recon complete",
            "analysis": {"interesting_findings": [], "key_insight": "done"},
            "guidance": ["Recon complete"],
        })

        with patch("rekonstrike.agent.graph.get_llm") as mock_get_llm:
            mock_get_llm.return_value.ainvoke = AsyncMock(
                side_effect=[resp_strategy, resp_triage]
            )

            runner = ReconAgentRunner(settings)
            result = await runner.run_reconnaissance(
                target_domain="example.com",
                goal="test",
                verbose=False,
                max_steps=5,
            )

            assert isinstance(result, ReconState)
            assert result.step_count > 0
            assert len(result.phases_tried) > 0


class TestRunReconnaissanceStream:
    @pytest.mark.asyncio
    async def test_stream_yields_events(self, settings):
        """Mock the astream and verify the callback receives events."""
        mock_step_1 = {"input_node": {"step_count": 1}}
        mock_step_2 = {"strategy_node": {
            "next_action": "phase_1_passive",
            "reasoning": "start passive",
            "strategy": {},
            "guidance": ["start"],
            "step_count": 2,
        }}
        mock_step_3 = {"stop_node": {"guidance": ["done"]}}

        with patch("rekonstrike.agent.runner.compiled_graph") as mock_graph:
            mock_graph.astream.return_value.__aiter__.return_value = [
                mock_step_1, mock_step_2, mock_step_3
            ]

            events = []

            async def event_callback(node, data):
                events.append((node, data))

            runner = ReconAgentRunner(settings)
            result = await runner.run_reconnaissance_stream(
                target_domain="example.com",
                goal="test",
                event_callback=event_callback,
            )

            assert isinstance(result, ReconState)
            assert len(events) > 0
