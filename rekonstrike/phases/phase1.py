"""Phase 1: Passive reconnaissance — OSINT subdomain enumeration"""
import asyncio
from . import phase
from ..output import out


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
        valid = {s.lower().strip() for s in all_subs
                 if s and self.ctx.scope.is_in_scope(s)}

        from ..database import Subdomain
        from sqlalchemy import select, insert

        max_subs = self.ctx.settings.max_subdomains
        valid_sorted = sorted(valid)

        if len(valid_sorted) > max_subs:
            out.warning(f"Capping {len(valid_sorted)} subdomains to max {max_subs}")
            valid_sorted = valid_sorted[:max_subs]

        # Bulk insert — multi-row INSERT for performance
        BATCH_SIZE = 2000
        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                existing_rows = await s.execute(
                    select(Subdomain.subdomain).where(
                        Subdomain.target_id == self.ctx.target_id
                    )
                )
                existing = {r[0] for r in existing_rows.fetchall()}

                new_subs = [sub for sub in valid_sorted if sub not in existing]

                stmt = insert(Subdomain)
                if self.ctx.settings.db_type == "postgresql":
                    stmt = stmt.on_conflict_do_nothing(
                        index_elements=["target_id", "subdomain"]
                    )
                else:
                    stmt = stmt.prefix_with("OR IGNORE")

                for i in range(0, len(new_subs), BATCH_SIZE):
                    batch = new_subs[i:i + BATCH_SIZE]
                    await s.execute(
                        stmt.values([
                            {"target_id": self.ctx.target_id,
                             "subdomain": sub, "source": "passive",
                             "resolved": False}
                            for sub in batch
                        ])
                    )

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
