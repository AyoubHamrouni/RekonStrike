import logging
from typing import Any

logger = logging.getLogger(__name__)


class BrowserCaptureClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    async def capture(self, target_url: str, max_steps: int = 3) -> dict[str, Any]:
        import aiohttp

        payload = {
            "target_url": target_url,
            "max_steps": max_steps,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/capture",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as resp:
                    if resp.status != 200:
                        logger.warning(
                            f"browser-service returned {resp.status} for {target_url}"
                        )
                        return {"success": False, "error": f"HTTP {resp.status}"}
                    data = await resp.json()
                    return {
                        "success": True,
                        "data": {
                            "raw_traffic": data.get("raw_traffic", []),
                            "js_bundles": data.get("js_bundles", []),
                            "source_maps": data.get("source_maps", []),
                            "screenshot_base64": data.get("screenshot_base64"),
                        },
                    }
        except Exception as e:
            logger.warning(f"browser capture failed for {target_url}: {e}")
            return {"success": False, "error": str(e)}

    async def capture_batch(
        self, urls: list[str], max_steps: int = 3, max_concurrent: int = 3
    ) -> dict[str, Any]:
        import asyncio

        semaphore = asyncio.Semaphore(max_concurrent)

        async def _capture_one(url: str) -> dict[str, Any]:
            async with semaphore:
                return await self.capture(url, max_steps=max_steps)

        tasks = [_capture_one(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        captures = []
        for url, result in zip(urls, results):
            if isinstance(result, Exception):
                captures.append({"url": url, "success": False, "error": str(result)})
            else:
                captures.append({"url": url, **result})

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
