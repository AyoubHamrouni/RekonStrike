"""Phase 3: Web probing — HTTP probe, tech detection, screenshots"""

from . import phase
from ..output import out
from ..repositories.target_repo import TargetRepository
from ..repositories.host_repo import HostRepository


@phase(3, "Web Probing", "HTTP probing, technology detection, metadata extraction")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        # Always query DB for resolved subdomains (Phase 2 may have updated this)
        async with self.ctx.db_session.begin():
            repo = TargetRepository(self.ctx.db_session)
            items, _ = await repo.get_subdomains(self.ctx.target_id, size=10000)
            subs = {r.subdomain for r in items}

        if not subs:
            out.warning("No subdomains to probe")
            return

        out.info(f"Probing {len(subs)} resolved subdomains for live HTTP services")

        from ..tools.wrappers import Httpx

        httpx = Httpx(self.ctx.runner, timeout=300)
        if not httpx.is_available:
            out.warning("httpx not installed — skipping probe")
            return

        input_data = "\n".join(f"https://{s}" for s in subs)

        result = await httpx.probe(input_data)
        hosts = result.json_lines()

        # WAF detection on 200/403 hosts
        from ..tools.wrappers import WafW00f

        waf = WafW00f(self.ctx.runner)
        if waf.is_available:
            for host in hosts:
                sc = host.get("status_code")
            if sc in (200, 403):
                url = host.get("url", "")
                if url:
                    wafs = await waf.detect(url)
                if wafs:
                    host["waf_detected"] = wafs
                    existing = host.get("response_headers") or {}
                    existing.setdefault("waf", wafs)
                    host["response_headers"] = existing

        from ..database import normalize_host

        rows = []
        for host in hosts:
            raw_url = host.get("url", "")
            if not raw_url:
                continue
            url = normalize_host(raw_url)
            rows.append(
                {
                    "url": url,
                    "raw_url": raw_url,
                    "status_code": host.get("status_code"),
                    "title": host.get("title", ""),
                    "technologies": host.get("tech", []),
                    "content_length": host.get("content_length"),
                    "web_server": host.get("webserver", ""),
                    "response_headers": host.get("response_headers", {}),
                }
            )

        if rows:
            async with self.ctx.db_session.begin():
                repo = HostRepository(
                    self.ctx.db_session, db_type=self.ctx.settings.db_type
                )
            await repo.add_live_hosts(rows)

        live_count = len(rows)
        urls = sorted({h.get("url", "") for h in hosts if h.get("url")})
        self.ctx.live_hosts = hosts
        out.result("Live Web Servers", urls)
        out.success(f"Phase 3 complete: {live_count} live hosts")
