import pytest
from datetime import datetime
from rekonstrike.agent.state import ReconState


class TestReconState:
    def test_defaults(self):
        state = ReconState(target_domain="example.com", goal="test")
        assert state.target_domain == "example.com"
        assert state.goal == "test"
        assert state.program_scope == {}
        assert state.platform_context == {}
        assert state.strategy == {}
        assert state.guidance == []
        assert state.discovered_subdomains == []
        assert state.live_hosts == []
        assert state.findings == []
        assert state.phase_results == {}
        assert state.tools_tried == []
        assert state.phases_tried == []
        assert state.next_action == ""
        assert state.reasoning == ""
        assert state.interrupt_reason == ""
        assert state.step_count == 0
        assert state.max_steps == 10
        assert state.last_tool_result == {}

    def test_started_at_defaults_to_now(self):
        state = ReconState(target_domain="example.com", goal="test")
        assert isinstance(state.started_at, datetime)

    def test_fields_set_explicitly(self):
        state = ReconState(
            target_domain="test.com",
            goal="find vulns",
            program_scope={"in_scope": ["test.com"], "out_of_scope": []},
            platform_context={"bounty_max": 5000},
            strategy={"depth_vs_breadth": "breadth"},
            guidance=["start here"],
            discovered_subdomains=["api.test.com"],
            live_hosts=[{"url": "https://api.test.com"}],
            findings=[{"type": "endpoint", "url": "https://api.test.com/admin"}],
            phase_results={"phase_1_passive": {"success": True}},
            next_action="phase_3_httpprobe",
            reasoning="because",
            max_steps=5,
            step_count=3,
        )
        assert state.target_domain == "test.com"
        assert state.program_scope["in_scope"] == ["test.com"]
        assert state.platform_context["bounty_max"] == 5000
        assert state.strategy["depth_vs_breadth"] == "breadth"
        assert state.guidance == ["start here"]
        assert state.discovered_subdomains == ["api.test.com"]
        assert len(state.live_hosts) == 1
        assert len(state.findings) == 1
        assert state.phase_results["phase_1_passive"]["success"] is True
        assert state.next_action == "phase_3_httpprobe"
        assert state.max_steps == 5
        assert state.step_count == 3

    def test_serialization_roundtrip(self):
        state = ReconState(
            target_domain="example.com",
            goal="test",
            guidance=["step 1", "step 2"],
        )
        dumped = state.model_dump()
        restored = ReconState(**dumped)
        assert restored.target_domain == "example.com"
        assert restored.guidance == ["step 1", "step 2"]
