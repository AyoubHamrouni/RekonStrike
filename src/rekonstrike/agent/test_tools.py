import asyncio
import pytest
from unittest.mock import patch
from rekonstrike.agent.tools_base import ToolBase
from rekonstrike.agent.tools import PassiveReconTool, HttpProbeTool
from rekonstrike.agent.tool_registry import ToolRegistry

@pytest.mark.asyncio
@patch("rekonstrike.agent.tools._run_subfinder", return_value=None)
async def test_passive_recon_valid_target(mock_subfinder):
    tool = PassiveReconTool()
    result = await tool.execute(target="example.com")
    assert result["success"] is True
    assert "subdomains" in result["data"]
    assert len(result["data"]["subdomains"]) > 0

@pytest.mark.asyncio
async def test_passive_recon_invalid_target():
    tool = PassiveReconTool()
    is_valid, err = await tool.validate_input(target="invalid!!!target")
    assert is_valid is False

@pytest.mark.asyncio
@patch("rekonstrike.agent.tools._run_httpx", return_value=None)
async def test_http_probe_with_scope(mock_httpx):
    tool = HttpProbeTool()
    with patch("rekonstrike.agent.tools.random.random", return_value=0.5):
        result = await tool.execute(
            targets=["http://api.example.com", "http://admin.example.com"],
            scope_filter={"in_scope": ["api.example.com"], "out_of_scope": ["admin.example.com"]}
        )
    assert result["success"] is True
    assert result["data"]["filtered_out"] == 1
    for p in result["data"]["probed"]:
        assert "api.example.com" in p["url"]

@pytest.mark.asyncio
async def test_registry_list_tools():
    registry = ToolRegistry()
    tools = registry.list_tools()
    assert len(tools) == 4
    assert tools[0]["name"] == "passive_recon"
    assert tools[1]["name"] == "http_probe"
    assert tools[2]["name"] == "content_discovery"
    assert tools[3]["name"] == "vuln_scan"

@pytest.mark.asyncio
@patch("rekonstrike.agent.tools._run_subfinder", return_value=None)
async def test_registry_call_tool_valid(mock_subfinder):
    registry = ToolRegistry()
    result = await registry.call_tool("passive_recon", target="example.com")
    assert result["success"] is True

class SleepingTool(ToolBase):
    name = "sleeper"
    description = "sleeps"
    
    async def execute(self, **kwargs):
        await asyncio.sleep(35)
        return {"success": True, "data": None, "error": None, "duration_seconds": 35}

@pytest.mark.asyncio
async def test_registry_call_tool_timeout():
    registry = ToolRegistry()
    registry.register(SleepingTool())
    
    with patch('src.rekonstrike.agent.tool_registry.asyncio.wait_for', side_effect=asyncio.TimeoutError):
        result = await registry.call_tool("sleeper")
        
    assert result["error"] == "timeout"
