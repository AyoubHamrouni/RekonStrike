"""Wordlist bundling — download missing wordlists from SecLists on startup."""

import asyncio
import logging
from pathlib import Path

import aiohttp

logger = logging.getLogger(__name__)

WORDLISTS: dict[str, Path] = {}

_SOURCES: dict[str, str] = {
    "common.txt": "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/common.txt",
    "api-endpoints.txt": "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/api/api-endpoints.txt",
    "subdomains-top1million-5000.txt": "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-5000.txt",
}

_DEST_NAMES: dict[str, str] = {
    "common.txt": "common",
    "api-endpoints.txt": "api",
    "subdomains-top1million-5000.txt": "subdomains",
}


async def _download(url: str, dest: Path) -> None:
    """Stream a wordlist from url to dest with progress logging."""
    logger.info("Downloading %s -> %s", url, dest)
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as f:
                async for chunk in resp.content.iter_chunked(65536):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded / total * 100
                        logger.info(
                            "  %s: %.0f%% (%d/%d bytes)",
                            dest.name,
                            pct,
                            downloaded,
                            total,
                        )
            logger.info("  %s complete (%d bytes)", dest.name, downloaded)


async def ensure_wordlists(data_dir: str) -> dict[str, Path]:
    """Ensure all wordlists exist under {data_dir}/wordlists/, downloading if missing.

    Returns a dict mapping short names ('common', 'api', 'subdomains') to Paths.
    """
    global WORDLISTS
    if WORDLISTS:
        return WORDLISTS

    base = Path(data_dir) / "wordlists"
    base.mkdir(parents=True, exist_ok=True)

    async def _ensure(filename: str, url: str) -> tuple[str, Path]:
        dest = base / filename
        if not dest.exists():
            try:
                await _download(url, dest)
            except Exception as e:
                logger.warning("Failed to download %s: %s", filename, e)
        return _DEST_NAMES[filename], dest

    results = await asyncio.gather(
        *[_ensure(fname, url) for fname, url in _SOURCES.items()],
        return_exceptions=True,
    )

    for r in results:
        if isinstance(r, tuple):
            key, path = r
            WORDLISTS[key] = path
        elif isinstance(r, BaseException):
            logger.warning("Wordlist download error: %s", r)

    return WORDLISTS
