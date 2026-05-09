import aiohttp
from typing import Annotated
from langchain_core.tools import tool
import logging

logger = logging.getLogger(__name__)


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
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url, timeout=aiohttp.ClientTimeout(total=5), allow_redirects=True
            ) as resp:
                text = await resp.text()
                status = resp.status
                snippet = text[:max_chars]
                return f"Status: {status}\n\nResponse Snippet:\n{snippet}"
    except Exception as e:
        logger.debug(f"fetch_http_snippet failed for {url}: {e}")
        return f"Error: Could not fetch URL - {str(e)}"
