import pytest

from rekonstrike.agent.phases import (
    list_phases,
    run_phase,
)
from rekonstrike.agent.state import ReconState


@pytest.fixture
def base_state():
    return ReconState(
        target_domain="example.com",
        goal="find vulnerabilities",
        program_scope={"in_scope": ["example.com"], "out_of_scope": []},
    )


class TestPhaseRegistry:
    def test_register_and_list(self):
        phases = list_phases()
        names = [p["name"] for p in phases]
        expected = [
            "phase_0_validate",
            "phase_1_passive",
            "phase_3_httpprobe",
            "phase_4_content",
            "phase_5_vulnscan",
            "phase_6_scoring",
        ]
        for name in expected:
            assert name in names, f"missing phase: {name}"

    def test_phase_ordering(self):
        phases = list_phases()
        numbers = [p["number"] for p in phases]
        assert numbers == sorted(numbers)

    def test_phase_metadata(self):
        phases = {p["name"]: p for p in list_phases()}
        assert phases["phase_0_validate"]["number"] == 0
        assert phases["phase_1_passive"]["number"] == 1
        assert phases["phase_3_httpprobe"]["number"] == 3
        assert phases["phase_4_content"]["number"] == 4
        assert phases["phase_5_vulnscan"]["number"] == 5
        assert phases["phase_6_scoring"]["number"] == 6
        assert phases["phase_1_passive"]["dependencies"] == ["phase_0_validate"]

    @pytest.mark.asyncio
    async def test_run_unknown_phase(self):
        state = ReconState(target_domain="x.com", goal="test")
        result = await run_phase("phase_nonexistent", state)
        assert result["success"] is False
        assert "unknown phase" in result["error"]


class TestPhaseValidate:
    @pytest.mark.asyncio
    async def test_provides_default_scope_when_missing(self):
        state = ReconState(target_domain="example.com", goal="test")
        result = await run_phase("phase_0_validate", state)
        assert result["success"] is True
        assert "in_scope" in result.get("program_scope", {})

    @pytest.mark.asyncio
    async def test_preserves_existing_scope(self, base_state):
        result = await run_phase("phase_0_validate", base_state)
        assert result["success"] is True
        assert result["program_scope"]["in_scope"] == ["example.com"]


class TestPhasePassive:
    @pytest.mark.asyncio
    async def test_discover_subdomains(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            program_scope={"in_scope": ["example.com"]},
        )
        result = await run_phase("phase_1_passive", state)
        assert result["success"] is True
        assert len(result.get("discovered_subdomains", [])) >= 3
        assert "passive_recon" in result.get("tools_run", [])

    @pytest.mark.asyncio
    async def test_prioritizes_strategy_targets(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            strategy={"priority_targets": ["api.example.com"]},
        )
        result = await run_phase("phase_1_passive", state)
        discovered = result.get("discovered_subdomains", [])
        assert "api.example.com" in discovered


class TestPhaseHttpprobe:
    @pytest.mark.asyncio
    async def test_fails_without_subdomains(self, base_state):
        result = await run_phase("phase_3_httpprobe", base_state)
        assert result["success"] is False
        assert "no subdomains" in result["error"]

    @pytest.mark.asyncio
    async def test_probes_discovered_subdomains(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        import random
        random.seed(42)
        state = ReconState(
            target_domain="example.com",
            goal="test",
            discovered_subdomains=["api.example.com", "admin.example.com"],
            program_scope={"in_scope": ["example.com"], "out_of_scope": []},
        )
        result = await run_phase("phase_3_httpprobe", state)
        assert result["success"] is True
        assert len(result.get("live_hosts", [])) > 0
        assert "http_probe" in result.get("tools_run", [])


class TestPhaseContent:
    @pytest.mark.asyncio
    async def test_fails_without_live_hosts(self, base_state):
        result = await run_phase("phase_4_content", base_state)
        assert result["success"] is False
        assert "no live hosts" in result["error"]

    @pytest.mark.asyncio
    async def test_discovers_endpoints(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            live_hosts=[{"url": "https://example.com", "status_code": 200}],
        )
        result = await run_phase("phase_4_content", state)
        assert result["success"] is True
        assert len(result.get("findings", [])) > 0
        assert result["findings"][0]["type"] == "endpoint"


class TestPhaseVulnscan:
    @pytest.mark.asyncio
    async def test_fails_without_live_hosts(self, base_state):
        result = await run_phase("phase_5_vulnscan", base_state)
        assert result["success"] is False
        assert "no live hosts" in result["error"]

    @pytest.mark.asyncio
    async def test_scans_live_hosts(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        import random
        random.seed(42)
        state = ReconState(
            target_domain="example.com",
            goal="test",
            live_hosts=[{"url": "https://example.com", "tech_stack": ["django"]}],
        )
        result = await run_phase("phase_5_vulnscan", state)
        assert result["success"] is True


class TestPhaseScoring:
    @pytest.mark.asyncio
    async def test_fails_without_live_hosts(self, base_state):
        result = await run_phase("phase_6_scoring", base_state)
        assert result["success"] is False
        assert "no hosts" in result["error"]

    @pytest.mark.asyncio
    async def test_scores_hosts(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            live_hosts=[{"url": "https://example.com", "status_code": 200}],
        )
        result = await run_phase("phase_6_scoring", state)
        assert result["success"] is True
        assert len(result.get("scored_hosts", [])) == 1
        assert "roi_score" in result["scored_hosts"][0]
        assert result["top_host"] == "https://example.com"

    @pytest.mark.asyncio
    async def test_severity_summary(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        state = ReconState(
            target_domain="example.com",
            goal="test",
            live_hosts=[{"url": "https://example.com", "status_code": 200}],
            phase_results={
                "phase_5_vulnscan": {
                    "vulnerabilities": [
                        {"severity": "high", "name": "XSS", "template": "xss"},
                    ]
                }
            },
        )
        result = await run_phase("phase_6_scoring", state)
        assert result["severity_summary"].get("high") == 1
