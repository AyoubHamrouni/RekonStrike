from .scope_tools import run_scope_advisor, ScopeAdvisor, _match_scope, _is_high_value

import aiohttp
from typing import Annotated
from langchain_core.tools import tool
import logging
import ipaddress
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


async def _resolve_public_host(host: str) -> bool:
    import asyncio
    import socket

    try:
        ip = ipaddress.ip_address(host)
        return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved)
    except ValueError:
        pass

    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    for family, _, _, _, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    return True


@tool
async def fetch_http_snippet(
    url: Annotated[str, "The URL to fetch"],
    max_chars: Annotated[
        int, "Maximum characters to return from the response body"
    ] = 2000,
) -> str:
    """Fetches a snippet of the HTTP response body for a given URL.
    Use this to verify if a suspected finding (e.g. a leaked secret or exposed panel)
    is actually present in the live response, or if it's a false positive (e.g. an error page or generic 404)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return "Error: URL must be http(s) with a valid hostname"
        if not await _resolve_public_host(parsed.hostname):
            return "Error: Refusing to fetch private or reserved network address"
        max_chars = min(max(max_chars, 0), 2000)
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url, timeout=aiohttp.ClientTimeout(total=5), allow_redirects=False
            ) as resp:
                text = await resp.text()
                status = resp.status
                snippet = text[:max_chars]
                return f"Status: {status}\n\nResponse Snippet:\n{snippet}"
    except Exception as e:
        logger.debug(f"fetch_http_snippet failed for {url}: {e}")
        return f"Error: Could not fetch URL - {str(e)}"

__all__ = [
    "run_scope_advisor", "ScopeAdvisor", "_match_scope", "_is_high_value",
    "_resolve_public_host", "fetch_http_snippet",
]
