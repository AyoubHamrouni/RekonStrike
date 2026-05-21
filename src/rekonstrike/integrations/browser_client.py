"""Async HTTP client for the browser-service (Playwright headless browser)."""

import asyncio
from dataclasses import dataclass, field
from typing import Optional
import aiohttp


@dataclass
class BrowserCaptureRequest:
    target_url: str
    scope: Optional[list[str]] = None
    auth_config: Optional[dict] = None
    max_steps: Optional[int] = None
    capture_screenshot: bool = False
    wait_for: Optional[str] = None


@dataclass
class BrowserCaptureResult:
    target_url: str
    captured_at: str
    rendered_html: str = ""
    network_logs: list[dict] = field(default_factory=list)
    cookies_set: list[dict] = field(default_factory=list)
    local_storage: list[dict] = field(default_factory=list)
    session_storage: list[dict] = field(default_factory=list)
    javascript_errors: list[dict] = field(default_factory=list)
    execution_time_ms: int = 0
    screenshot_base64: Optional[str] = None
    js_bundles: list[dict] = field(default_factory=list)
    source_maps: list[dict] = field(default_factory=list)
    note: Optional[str] = None


class BrowserClient:
    """Async HTTP client for browser-service.

    Usage:
        client = BrowserClient("http://browser-service:3001", "my-token")
        result = await client.capture(BrowserCaptureRequest(target_url="https://example.com"))
    """

    def __init__(self, base_url: str, token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.token}"} if self.token else {},
                timeout=aiohttp.ClientTimeout(total=60),
            )
        return self._session

    async def capture(self, req: BrowserCaptureRequest) -> BrowserCaptureResult:
        session = await self._get_session()
        payload: dict = {"target_url": req.target_url}
        if req.scope:
            payload["scope"] = req.scope
        if req.auth_config:
            payload["auth_config"] = req.auth_config
        if req.max_steps is not None:
            payload["max_steps"] = req.max_steps
        if req.capture_screenshot:
            payload["capture_screenshot"] = True
        if req.wait_for:
            payload["wait_for"] = req.wait_for

        async with session.post("/capture", json=payload) as resp:
            data = await resp.json()
            return BrowserCaptureResult(**data)

    async def health(self) -> dict:
        session = await self._get_session()
        async with session.get("/health") as resp:
            return await resp.json()

    async def capture_batch(
        self, urls: list[str], max_steps: int = 3, max_concurrent: int = 3
    ) -> dict:
        semaphore = asyncio.Semaphore(max_concurrent)

        async def _capture_one(url: str) -> dict:
            async with semaphore:
                req = BrowserCaptureRequest(target_url=url, max_steps=max_steps)
                result = await self.capture(req)
                return {"url": url, "success": True, "data": {
                    "js_bundles": result.js_bundles,
                    "source_maps": result.source_maps,
                    "raw_traffic": result.network_logs,
                    "screenshot_base64": result.screenshot_base64,
                }}

        tasks = [_capture_one(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        captures = []
        for url, result in zip(urls, results):
            if isinstance(result, Exception):
                captures.append({"url": url, "success": False, "error": str(result)})
            else:
                captures.append(result)

        js_bundles = []
        source_maps = []
        successful = sum(1 for c in captures if c.get("success"))

        for c in captures:
            if c.get("success") and c.get("data"):
                js_bundles.extend(c["data"].get("js_bundles", []))
                source_maps.extend(c["data"].get("source_maps", []))

        return {
            "success": successful > 0,
            "captures": captures,
            "js_bundles": js_bundles,
            "source_maps": source_maps,
            "total_captured": successful,
        }

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
