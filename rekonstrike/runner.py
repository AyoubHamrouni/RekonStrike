"""Tool execution — native subprocess (dev) + Docker (production) with async"""
import asyncio
import time
import json
import shutil
from pathlib import Path
from typing import Optional, Callable

from .config import Settings


class ToolResult:
    __slots__ = ("tool", "returncode", "stdout", "stderr", "command", "execution_time", "success")

    def __init__(self, tool: str, returncode: int, stdout: str, stderr: str,
                 command: str, execution_time: float):
        self.tool = tool
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        self.command = command
        self.execution_time = execution_time
        self.success = returncode == 0

    def lines(self) -> list[str]:
        return [l.strip() for l in self.stdout.splitlines() if l.strip()]

    def json_lines(self) -> list[dict]:
        return [json.loads(l) for l in self.lines() if l.startswith("{")]


class ToolRunner:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._semaphore = asyncio.Semaphore(settings.tool_concurrency)
        self._mode = settings.tool_mode
        self._docker_available = bool(shutil.which("docker"))

    def is_available(self, tool: str) -> bool:
        if self._mode == "docker":
            return self._docker_available
        return shutil.which(tool) is not None

    async def run(self, tool: str, args: list[str], timeout: Optional[int] = None,
                  stdin: Optional[str] = None,
                  on_line: Optional[Callable[[str], None]] = None) -> ToolResult:
        async with self._semaphore:
            if self._mode == "docker" and self._docker_available:
                return await self._run_docker(tool, args, timeout, stdin, on_line)
            return await self._run_native(tool, args, timeout, stdin, on_line)

    async def run_pipe(self, tool: str, args: list[str], input_data: str,
                       timeout: Optional[int] = None) -> ToolResult:
        return await self.run(tool, args, timeout, stdin=input_data)

    async def _run_native(self, tool: str, args: list[str],
                          timeout: Optional[int], stdin: Optional[str],
                          on_line: Optional[Callable]) -> ToolResult:
        cmd = [tool] + args
        start = time.monotonic()
        to = timeout or self.settings.tool_timeout

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE if stdin else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            # Write stdin BEFORE reading output to avoid deadlock
            if stdin:
                proc.stdin.write(stdin.encode())
                await proc.stdin.drain()
                proc.stdin.close()

            stdout_data: list[str] = []

            async def _reader(stream, is_stderr=False):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    if not is_stderr:
                        stdout_data.append(decoded)
                        if on_line:
                            on_line(decoded)

            await asyncio.wait_for(
                asyncio.gather(
                    _reader(proc.stdout),
                    _reader(proc.stderr, True),
                    proc.wait(),
                ),
                timeout=to,
            )

            elapsed = time.monotonic() - start
            return ToolResult(tool, proc.returncode or 0,
                              "\n".join(stdout_data), "", " ".join(cmd), round(elapsed, 2))

        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            return ToolResult(tool, -1, "", f"timeout ({to}s)", " ".join(cmd), round(time.monotonic() - start, 2))
        except FileNotFoundError:
            return ToolResult(tool, -1, "", f"not found: {tool}", " ".join(cmd), 0)
        except Exception as e:
            return ToolResult(tool, -1, "", str(e), " ".join(cmd), round(time.monotonic() - start, 2))

    async def _run_docker(self, tool: str, args: list[str],
                          timeout: Optional[int], stdin: Optional[str],
                          on_line: Optional[Callable]) -> ToolResult:
        cmd = ["docker", "run", "--rm", "-i",
               f"rekonstrike/{tool}:latest"] + args
        start = time.monotonic()
        to = timeout or self.settings.tool_timeout

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE if stdin else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            # Write stdin BEFORE reading output to avoid deadlock
            if stdin:
                proc.stdin.write(stdin.encode())
                await proc.stdin.drain()
                proc.stdin.close()

            stdout_data: list[str] = []

            async def _reader(stream, is_stderr=False):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    if not is_stderr:
                        stdout_data.append(decoded)
                        if on_line:
                            on_line(decoded)

            await asyncio.wait_for(
                asyncio.gather(
                    _reader(proc.stdout),
                    _reader(proc.stderr, True),
                    proc.wait(),
                ),
                timeout=to,
            )

            elapsed = time.monotonic() - start
            return ToolResult(tool, proc.returncode or 0,
                              "\n".join(stdout_data), "", " ".join(cmd), round(elapsed, 2))

        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            return ToolResult(tool, -1, "", f"timeout ({to}s)", " ".join(cmd), round(time.monotonic() - start, 2))
        except FileNotFoundError:
            return ToolResult(tool, -1, "", f"not found: {tool}", " ".join(cmd), 0)
        except Exception as e:
            return ToolResult(tool, -1, "", str(e), " ".join(cmd), round(time.monotonic() - start, 2))
