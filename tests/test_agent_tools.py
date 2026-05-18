import pytest
from rekonstrike.agent.tools_base import ToolBase
from rekonstrike.agent.tools import (
    PassiveReconTool,
    HttpProbeTool,
    ContentDiscoveryTool,
    VulnScanTool,
    _mock_subdomains,
    _mock_probed,
    _mock_endpoints,
    _mock_vulns,
    _in_scope,
)


class TestToolBase:
    class ConcreteTool(ToolBase):
        name = "concrete"
        description = "test"
        async def execute(self, **kwargs):
            return {"success": True, "data": {}, "error": None, "duration_seconds": 0}

    @pytest.mark.asyncio
    async def test_validate_input_default(self):
        tool = self.ConcreteTool()
        valid, msg = await tool.validate_input(foo="bar")
        assert valid is True
        assert msg == ""

    def test_execute_works_on_concrete(self):
        import asyncio
        tool = self.ConcreteTool()
        result = asyncio.run(tool.execute())
        assert result["success"] is True


class TestPassiveReconTool:
    @pytest.mark.asyncio
    async def test_validate_input_valid(self):
        tool = PassiveReconTool()
        valid, msg = await tool.validate_input(target="example.com")
        assert valid is True
        assert msg == ""

    @pytest.mark.asyncio
    async def test_validate_input_invalid(self):
        tool = PassiveReconTool()
        invalid_domains = ["", "not-a-domain", "http://example.com", "example"]
        for d in invalid_domains:
            valid, msg = await tool.validate_input(target=d)
            assert valid is False, f"expected invalid for {d}"
            assert msg == "invalid domain"

    @pytest.mark.asyncio
    async def test_execute_returns_mock_data(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        tool = PassiveReconTool()
        result = await tool.execute(target="example.com", max_results=500)
        assert result["success"] is True
        assert result["error"] is None
        assert "subdomains" in result["data"]
        assert len(result["data"]["subdomains"]) == 3
        assert "api.example.com" in result["data"]["subdomains"]
        assert "discovered_at" in result["data"]
        assert result["duration_seconds"] >= 0

    @pytest.mark.asyncio
    async def test_execute_respects_max_results(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        tool = PassiveReconTool()
        result = await tool.execute(target="example.com", max_results=1)
        assert len(result["data"]["subdomains"]) == 1


class TestHttpProbeTool:
    @pytest.mark.asyncio
    async def test_validate_input_valid(self):
        tool = HttpProbeTool()
        valid, msg = await tool.validate_input(targets=["https://example.com"])
        assert valid is True

    @pytest.mark.asyncio
    async def test_validate_input_empty(self):
        tool = HttpProbeTool()
        valid, msg = await tool.validate_input(targets=[])
        assert valid is False
        assert "non-empty" in msg

    @pytest.mark.asyncio
    async def test_validate_input_non_strings(self):
        tool = HttpProbeTool()
        valid, msg = await tool.validate_input(targets=[123])
        assert valid is False
        assert "strings" in msg

    @pytest.mark.asyncio
    async def test_execute_returns_mock_data(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        import random
        random.seed(42)
        tool = HttpProbeTool()
        result = await tool.execute(targets=["https://example.com"])
        assert result["success"] is True
        assert "probed" in result["data"]
        assert result["data"]["live_count"] > 0
        assert result["data"]["filtered_out"] >= 0


class TestContentDiscoveryTool:
    @pytest.mark.asyncio
    async def test_validate_input_valid(self):
        tool = ContentDiscoveryTool()
        valid, msg = await tool.validate_input(urls=["https://example.com"])
        assert valid is True

    @pytest.mark.asyncio
    async def test_validate_input_empty(self):
        tool = ContentDiscoveryTool()
        valid, msg = await tool.validate_input(urls=[])
        assert valid is False

    @pytest.mark.asyncio
    async def test_execute_returns_mock_data(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        tool = ContentDiscoveryTool()
        result = await tool.execute(urls=["https://example.com"])
        assert result["success"] is True
        assert "endpoints" in result["data"]
        assert result["data"]["count"] > 0


class TestVulnScanTool:
    @pytest.mark.asyncio
    async def test_validate_input_valid(self):
        tool = VulnScanTool()
        valid, msg = await tool.validate_input(urls=["https://example.com"])
        assert valid is True

    @pytest.mark.asyncio
    async def test_validate_input_empty(self):
        tool = VulnScanTool()
        valid, msg = await tool.validate_input(urls=[])
        assert valid is False

    @pytest.mark.asyncio
    async def test_execute_returns_mock_data(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        tool = VulnScanTool()
        tech_map = {"https://example.com": ["django"]}
        result = await tool.execute(urls=["https://example.com"], tech_stack=tech_map)
        assert result["success"] is True
        assert "vulnerabilities" in result["data"]


class TestMockHelpers:
    def test_mock_subdomains(self):
        subs = _mock_subdomains("example.com")
        assert len(subs) == 3
        assert "api.example.com" in subs

    def test_mock_probed(self):
        probed = _mock_probed(["api.example.com"], ["api"], [])
        for h in probed:
            assert "url" in h
            assert "status_code" in h
            assert "title" in h

    def test_mock_probed_filters_out_of_scope(self):
        probed = _mock_probed(["api.example.com", "internal.example.com"], [], ["internal"])
        urls = [h["url"] for h in probed]
        assert "internal.example.com" not in urls

    def test_mock_endpoints(self):
        endpoints = _mock_endpoints(["https://example.com"])
        assert len(endpoints) > 0
        for e in endpoints:
            assert "url" in e
            assert "status_code" in e
            assert e["url"].startswith("https://example.com")

    def test_mock_vulns(self):
        tech_map = {"https://example.com": ["django"]}
        vulns = _mock_vulns(["https://example.com"], tech_map)
        if vulns:
            assert "template" in vulns[0]
            assert "severity" in vulns[0]

    def test_in_scope_in_pattern(self):
        assert _in_scope("https://api.example.com", ["api"], []) is True
        assert _in_scope("https://www.example.com", ["api"], []) is False

    def test_in_scope_out_pattern(self):
        assert _in_scope("https://internal.example.com", [], ["internal"]) is False
        assert _in_scope("https://api.example.com", [], ["internal"]) is True
