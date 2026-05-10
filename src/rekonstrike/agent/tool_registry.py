import asyncio
import logging
import time
from typing import Optional
from .tools_base import ToolBase
from .tools import PassiveReconTool, HttpProbeTool

class ToolRegistry:
    def __init__(self):
        self._tools = {}
        self.register(PassiveReconTool())
        self.register(HttpProbeTool())
        
    def register(self, tool: ToolBase):
        self._tools[tool.name] = tool
        
    def get_tool(self, tool_name: str) -> Optional[ToolBase]:
        return self._tools.get(tool_name)
        
    def list_tools(self) -> list[dict]:
        return [{"name": t.name, "description": t.description} for t in self._tools.values()]
        
    async def call_tool(self, tool_name: str, **kwargs) -> dict:
        start_time = time.time()
        tool = self.get_tool(tool_name)
        if not tool:
            result = {
                "success": False,
                "error": f"tool '{tool_name}' not found",
                "data": None,
                "duration_seconds": time.time() - start_time
            }
            logging.info(f"Tool {tool_name} called with {kwargs}, result: {result}")
            return result
            
        is_valid, err_msg = await tool.validate_input(**kwargs)
        if not is_valid:
            result = {
                "success": False,
                "error": err_msg,
                "data": None,
                "duration_seconds": time.time() - start_time
            }
            logging.info(f"Tool {tool_name} called with {kwargs}, result: {result}")
            return result
            
        try:
            result = await asyncio.wait_for(tool.execute(**kwargs), timeout=30.0)
            logging.info(f"Tool {tool_name} called with {kwargs}, result: {result}")
            return result
        except asyncio.TimeoutError:
            result = {
                "success": False,
                "error": "timeout",
                "data": None,
                "duration_seconds": 30.0
            }
            logging.info(f"Tool {tool_name} called with {kwargs}, result: {result}")
            return result
        except Exception as e:
            result = {
                "success": False,
                "error": str(e),
                "data": None,
                "duration_seconds": time.time() - start_time
            }
            logging.info(f"Tool {tool_name} called with {kwargs}, result: {result}")
            return result
