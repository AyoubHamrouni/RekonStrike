import pytest
from rekonstrike.agent.tool_registry import ToolRegistry
from rekonstrike.agent.tools_base import ToolBase


class TestToolRegistry:
    def test_register_and_list(self):
        registry = ToolRegistry()
        tools = registry.list_tools()
        names = [t["name"] for t in tools]
        assert "passive_recon" in names
        assert "http_probe" in names
        assert "content_discovery" in names
        assert "vuln_scan" in names
        assert len(tools) == 4

    def test_get_tool(self):
        registry = ToolRegistry()
        tool = registry.get_tool("passive_recon")
        assert tool is not None
        assert tool.name == "passive_recon"

    def test_get_tool_unknown(self):
        registry = ToolRegistry()
        assert registry.get_tool("nonexistent") is None

    def test_list_tools_format(self):
        registry = ToolRegistry()
        for t in registry.list_tools():
            assert "name" in t
            assert "description" in t
            assert isinstance(t["name"], str)
            assert isinstance(t["description"], str)

    @pytest.mark.asyncio
    async def test_call_tool_unknown(self):
        registry = ToolRegistry()
        result = await registry.call_tool("nonexistent", target="example.com")
        assert result["success"] is False
        assert "not found" in result["error"]

    @pytest.mark.asyncio
    async def test_call_tool_validation_failure(self):
        registry = ToolRegistry()
        result = await registry.call_tool("passive_recon", target="")
        assert result["success"] is False
        assert result["error"] == "invalid domain"

    @pytest.mark.asyncio
    async def test_call_tool_success(self):
        registry = ToolRegistry()
        result = await registry.call_tool("passive_recon", target="example.com")
        assert result["success"] is True
        assert "subdomains" in result["data"]

    @pytest.mark.asyncio
    async def test_call_tool_timeout(self):
        class SlowTool(ToolBase):
            name = "slow_tool"
            description = "slow"

            async def execute(self, **kwargs):
                import asyncio
                await asyncio.sleep(100)
                return {"success": True, "data": {}, "error": None, "duration_seconds": 100}

        registry = ToolRegistry()
        registry.register(SlowTool())
        result = await registry.call_tool("slow_tool", timeout=0.01)
        assert result["success"] is False
        assert result["error"] == "timeout"

    @pytest.mark.asyncio
    async def test_call_tool_execution_error(self):
        class FailingTool(ToolBase):
            name = "failing_tool"
            description = "fails"

            async def execute(self, **kwargs):
                raise RuntimeError("something broke")

        registry = ToolRegistry()
        registry.register(FailingTool())
        result = await registry.call_tool("failing_tool")
        assert result["success"] is False
        assert "something broke" in result["error"]


class TestToolRegistryIntegration:
    @pytest.mark.asyncio
    async def test_passive_recon_via_registry(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        registry = ToolRegistry()
        result = await registry.call_tool("passive_recon", target="example.com")
        assert result["success"] is True
        assert len(result["data"]["subdomains"]) == 3

    @pytest.mark.asyncio
    async def test_http_probe_via_registry(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        registry = ToolRegistry()
        result = await registry.call_tool("http_probe", targets=["https://example.com"])
        assert result["success"] is True
        assert result["data"]["live_count"] > 0

    @pytest.mark.asyncio
    async def test_content_discovery_via_registry(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        registry = ToolRegistry()
        result = await registry.call_tool("content_discovery", urls=["https://example.com"])
        assert result["success"] is True
        assert result["data"]["count"] > 0

    @pytest.mark.asyncio
    async def test_vuln_scan_via_registry(self, monkeypatch):
        monkeypatch.setenv("RS_USE_REAL_TOOLS", "")
        registry = ToolRegistry()
        result = await registry.call_tool("vuln_scan", urls=["https://example.com"])
        assert result["success"] is True
