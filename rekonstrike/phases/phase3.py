"""Phase 3: Web probing — HTTP probe, tech detection, screenshots"""
from . import phase
from ..output import out
from ..database import LiveHost, Subdomain
from sqlalchemy import select


@phase(3, "Web Probing",
       "HTTP probing, technology detection, metadata extraction")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        # Always query DB for resolved subdomains (Phase 2 may have updated this)
        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                rows = await s.execute(
                    select(Subdomain.subdomain).where(
                        Subdomain.target_id == self.ctx.target_id,
                    )
                )
                subs = {r[0] for r in rows.fetchall()}

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

        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                existing_rows = await s.execute(
                    select(LiveHost.url).where(LiveHost.url.isnot(None))
                )
                existing_urls = {r[0] for r in existing_rows.fetchall()}

                rows = []
                for host in hosts:
                    url = host.get("url", "")
                    if not url or url in existing_urls:
                        continue
                    rows.append({
                        "url": url,
                        "status_code": host.get("status_code"),
                        "title": host.get("title", ""),
                        "technologies": host.get("tech", []),
                        "content_length": host.get("content_length"),
                        "web_server": host.get("webserver", ""),
                        "response_headers": host.get("response_headers", {}),
                    })

                if rows:
                    from sqlalchemy import insert
                    stmt = insert(LiveHost)
                    if self.ctx.settings.db_type == "postgresql":
                        stmt = stmt.on_conflict_do_nothing(
                            index_elements=["url"]
                        )
                    else:
                        stmt = stmt.prefix_with("OR IGNORE")
                    await s.execute(stmt.values(rows))

        live_count = len(rows)

        urls = sorted({h.get("url", "") for h in hosts if h.get("url")})
        self.ctx.live_hosts = hosts
        out.result("Live Web Servers", urls)
        out.success(f"Phase 3 complete: {live_count} live hosts")
