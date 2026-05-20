"""Async HTTP client for the browser-service (Playwright headless browser)."""

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

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
