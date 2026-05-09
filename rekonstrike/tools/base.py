"""Base tool wrapper"""
from typing import Optional, Callable
from ..runner import ToolRunner, ToolResult


class BaseTool:
    name = ""
    binary = ""

    def __init__(self, runner: ToolRunner, timeout: int = 600):
        self.runner = runner
        self.timeout = timeout

    async def execute(self, args: list[str], stdin: Optional[str] = None,
                      on_line: Optional[Callable[[str], None]] = None) -> ToolResult:
        return await self.runner.run(
            self.binary, args, timeout=self.timeout,
            stdin=stdin, on_line=on_line,
        )

    @property
    def is_available(self) -> bool:
        return self.runner.is_available(self.binary)
