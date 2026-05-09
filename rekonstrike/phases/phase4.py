"""Phase 4: Content discovery — crawling, JS analysis, parameter mining"""
import asyncio
from pathlib import Path
from . import phase
from ..output import out


@phase(4, "Content Discovery",
       "Web crawling, JavaScript analysis, endpoint extraction, parameter discovery")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        live = self.ctx.live_hosts
        if not live:
            out.warning("No live hosts to crawl")
            return

        targets = [h.get("url", "") for h in live if h.get("url")][:20]
        out.info(f"Content discovery on {len(targets)} targets")

        from ..tools.wrappers import GoSpider, Gau, Katana, Ffuf, CeWL
        all_endpoints: set[str] = set()
        tasks = []

        # ── GoSpider ────────────────────────────────────────────────────
        gs = GoSpider(self.ctx.runner)
        if gs.is_available:
            tasks.append(self._run_gospider(gs, targets))

        # ── GAU ─────────────────────────────────────────────────────────
        gau = Gau(self.ctx.runner)
        if gau.is_available:
            tasks.append(self._run_gau(gau, targets))

        # ── Katana ──────────────────────────────────────────────────────
        ka = Katana(self.ctx.runner)
        if ka.is_available:
            tasks.append(self._run_katana(ka, targets))

        # ── ffuf ────────────────────────────────────────────────────────
        ff = Ffuf(self.ctx.runner)
        wordlists = self.ctx.wordlists
        common_wl = wordlists.get("common")
        if common_wl and not Path(common_wl).exists():
            out.warning("common.txt wordlist missing, skipping ffuf content fuzz")
            common_wl = None
        api_wl = wordlists.get("api")
        if api_wl and not Path(api_wl).exists():
            out.warning("api-endpoints.txt wordlist missing, skipping ffuf api fuzz")
            api_wl = None

        if ff.is_available and common_wl:
            tasks.append(self._run_ffuf(ff, targets[:5], str(common_wl)))
        if ff.is_available and api_wl:
            tasks.append(self._run_ffuf_api(ff, targets[:5], str(api_wl)))

        # ── CeWL ────────────────────────────────────────────────────────
        cw = CeWL(self.ctx.runner)
        if cw.is_available:
            tasks.append(self._run_cewl(cw, targets[:3]))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, set):
                    all_endpoints.update(r)

        out.result("Discovered Endpoints", sorted(all_endpoints))
        out.success(f"Phase 4 complete: {len(all_endpoints)} endpoints")

    async def _run_gospider(self, tool, targets: list[str]) -> set[str]:
        import json
        discovered: set[str] = set()
        for url in targets[:10]:
            try:
                r = await tool.crawl(url)
                for line in r.lines():
                    try:
                        data = json.loads(line)
                        ep = data.get("output", data.get("url", ""))
                        if ep:
                            discovered.add(ep)
                    except json.JSONDecodeError:
                        if line.startswith("http"):
                            discovered.add(line)
            except Exception as e:
                out.warning(f"GoSpider {url}: {e}")
        out.success(f"GoSpider: {len(discovered)} endpoints")
        return discovered

    async def _run_gau(self, tool, targets: list[str]) -> set[str]:
        from urllib.parse import urlparse
        discovered: set[str] = set()
        for target in targets[:5]:
            domain = urlparse(target).hostname or ""
            try:
                r = await tool.fetch(domain)
                for line in r.lines():
                    if line.startswith("http"):
                        discovered.add(line)
            except Exception as e:
                out.warning(f"GAU {domain}: {e}")
        out.success(f"GAU: {len(discovered)} URLs")
        return discovered

    async def _run_katana(self, tool, targets: list[str]) -> set[str]:
        discovered: set[str] = set()
        for url in targets[:5]:
            try:
                r = await tool.crawl(url)
                for line in r.lines():
                    if line.startswith("http"):
                        discovered.add(line)
            except Exception as e:
                out.warning(f"Katana {url}: {e}")
        out.success(f"Katana: {len(discovered)} endpoints")
        return discovered

    async def _run_ffuf(self, tool, targets: list[str], wordlist: str) -> set[str]:
        discovered: set[str] = set()
        for url in targets:
            try:
                r = await tool.fuzz(url.rstrip("/") + "/FUZZ", wordlist)
                for line in r.lines():
                    if line.startswith("http"):
                        discovered.add(line)
            except Exception as e:
                out.warning(f"ffuf {url}: {e}")
        out.success(f"ffuf: {len(discovered)} endpoints")
        return discovered

    async def _run_ffuf_api(self, tool, targets: list[str], wordlist: str) -> set[str]:
        discovered: set[str] = set()
        for url in targets:
            try:
                r = await tool.fuzz(url.rstrip("/") + "/api/FUZZ", wordlist)
                for line in r.lines():
                    if line.startswith("http"):
                        discovered.add(line)
            except Exception as e:
                out.warning(f"ffuf api {url}: {e}")
        out.success(f"ffuf api: {len(discovered)} endpoints")
        return discovered

    async def _run_cewl(self, tool, targets: list[str]) -> set[str]:
        discovered: set[str] = set()
        for url in targets:
            try:
                r = await tool.wordlist(url)
                discovered.update(r.lines())
            except Exception as e:
                out.warning(f"CeWL {url}: {e}")
        out.success(f"CeWL: {len(discovered)} words")
        return discovered
