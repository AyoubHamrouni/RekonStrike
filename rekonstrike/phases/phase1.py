"""Phase 1: Passive reconnaissance — OSINT subdomain enumeration"""
from . import phase
from ..output import out
from ..repositories.target_repo import TargetRepository


@phase(1, "Passive Reconnaissance",
       "Subdomain enumeration via passive OSINT sources (crt.sh, subfinder, gau, github)")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        target = self._domain()
        out.info(f"Passive enumeration for: [bold]{target}[/bold]")
        all_subs: set[str] = set()

        # ── crt.sh ─────────────────────────────────────────────────────────
        crt = await self._crt_sh(target)
        all_subs.update(crt)
        out.success(f"crt.sh: {len(crt)} subdomains")

        # ── Subfinder ──────────────────────────────────────────────────────
        from ..tools.wrappers import Subfinder
        sf = Subfinder(self.ctx.runner)
        if sf.is_available:
            try:
                results = await sf.enumerate(target)
                all_subs.update(results)
                out.success(f"Subfinder: {len(results)} subdomains")
            except Exception as e:
                out.warning(f"Subfinder failed: {e}")

        # ── GAU ────────────────────────────────────────────────────────────
        from ..tools.wrappers import Gau
        gau = Gau(self.ctx.runner)
        if gau.is_available:
            try:
                subs = await self._run_gau(gau, target)
                all_subs.update(subs)
                out.success(f"GAU: {len(subs)} subdomains")
            except Exception as e:
                out.warning(f"GAU failed: {e}")

        # ── GitHub ─────────────────────────────────────────────────────────
        token = self.ctx.settings.api_key("github")
        if token:
            from ..tools.wrappers import GitHubRecon
            gh = GitHubRecon(self.ctx.runner)
            if gh.is_available:
                try:
                    result = await gh.search(target, token)
                    gh_subs = set(result.lines())
                    all_subs.update(gh_subs)
                    out.success(f"GitHub: {len(gh_subs)} subdomains")
                except Exception as e:
                    out.warning(f"GitHub recon failed: {e}")

        # ── Filter & Store ────────────────────────────────────────────────
        from ..database import normalize_host
        valid = set()
        for s in all_subs:
            h = normalize_host(s.lower().strip()) if s else ""
            if h and self.ctx.scope.is_in_scope(h):
                valid.add(h)

        # Normalize existing subdomains (may contain URLs)
        for s in getattr(self.ctx, "subdomains", []):
            h = normalize_host(s)
            if h and self.ctx.scope.is_in_scope(h):
                valid.add(h)

        max_subs = self.ctx.settings.max_subdomains
        valid_sorted = sorted(valid)

        if len(valid_sorted) > max_subs:
            out.warning(f"Capping {len(valid_sorted)} subdomains to max {max_subs}")
            valid_sorted = valid_sorted[:max_subs]

        # Use Repository for storage
        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                repo = TargetRepository(s)
                await repo.add_subdomains(self.ctx.target_id, valid_sorted, source="passive")

        out.result("Passive Subdomains", sorted(valid))
        self.ctx.subdomains = valid
        out.success(f"Phase 1 complete: {len(valid)} unique subdomains")

    def _domain(self) -> str:
        t = self.ctx.target
        if self.ctx.target_type == "wildcard":
            return t.lstrip("*.")
        if self.ctx.target_type == "company":
            return t
        return t

    async def _crt_sh(self, domain: str) -> set[str]:
        import aiohttp
        subs: set[str] = set()
        try:
            headers = {"User-Agent": "RekonStrike/0.1.0 (reconnaissance framework)"}
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(
                    f"https://crt.sh/?q=%25.{domain}&output=json",
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for entry in data:
                            name = (entry.get("name_value") or "").strip().lower()
                            for n in name.split("\n"):
                                n = n.strip()
                                if n.endswith(f".{domain}") or n == domain:
                                    subs.add(n)
        except Exception as e:
            out.warning(f"crt.sh error: {e}")
        return subs

    async def _run_gau(self, tool, domain: str) -> set[str]:
        from urllib.parse import urlparse
        subs: set[str] = set()
        result = await tool.fetch(domain)
        for line in result.lines():
            try:
                host = urlparse(line).hostname or ""
                if host.endswith(f".{domain}") or host == domain:
                    subs.add(host)
            except Exception:
                pass
        return subs
