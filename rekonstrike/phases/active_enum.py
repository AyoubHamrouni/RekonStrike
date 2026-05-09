"""Phase 2: Active reconnaissance — DNS brute-force, cloud enum, port scanning"""

import asyncio
from . import phase
from ..output import out


@phase(
    2, "Active Reconnaissance", "DNS brute-force, port scanning, cloud asset discovery"
)
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        domain = self._domain()
        out.info(f"Active reconnaissance for: [bold]{domain}[/bold]")

        if self.ctx.target_type == "company":
            await self._company_workflow(domain)
        else:
            await self._domain_workflow(domain)

    def _domain(self) -> str:
        t = self.ctx.target
        if self.ctx.target_type == "wildcard":
            return t.lstrip("*.")
        return t

    async def _company_workflow(self, company: str):
        from ..tools.wrappers import (
            Metabigor,
            AmassIntelligence,
            SecurityTrailsAPI,
            WhoisLookup,
        )

        discovered: set[str] = set()
        st_api_key = self.ctx.settings.api_key("securitytrails")
        whois_key = self.ctx.settings.api_key("whoisxmlapi")

        # ── SecurityTrails — company domains ────────────────────────────
        if st_api_key:
            st = SecurityTrailsAPI(st_api_key)
            out.info("SecurityTrails — company domain discovery")
            try:
                domains = await st.company_domains(company)
                discovered.update(domains)
                out.success(f"SecurityTrails: {len(domains)} domains")
            except Exception as e:
                out.warning(f"SecurityTrails failed: {e}")

        # ── Metabigor ASN ──────────────────────────────────────────────
        metabigor = Metabigor(self.ctx.runner)
        if metabigor.is_available:
            out.info("Metabigor ASN discovery")
            try:
                r = await metabigor.asn(company)
                lines = r.lines()
                if lines:
                    out.success(f"Metabigor: {len(lines)} ASN results")
                    # Feed ASNs into SecurityTrails if available
                    if st_api_key and st.is_available:
                        for asn_line in lines[:10]:
                            asn = asn_line.strip().lstrip("AS").strip()
                            if asn.isdigit():
                                try:
                                    info = await st.asn_info(asn)
                                    for prefix in info.get("prefixes", []):
                                        ip = prefix.get("ip") or prefix.get("cidr", "")
                                        if ip:
                                            discovered.add(ip)
                                except Exception:
                                    pass
            except Exception as e:
                out.warning(f"Metabigor failed: {e}")

        # ── WHOIS ──────────────────────────────────────────────────────
        whois = WhoisLookup(whois_key)
        if whois.is_available:
            out.info("WHOIS lookup")
            try:
                result = await whois.lookup(company)
                if "raw" in result:
                    line_count = len(result["raw"].splitlines())
                    out.success(f"WHOIS: {line_count} lines")
            except Exception as e:
                out.warning(f"WHOIS failed: {e}")

        # ── Amass intel ────────────────────────────────────────────────
        amass = AmassIntelligence(self.ctx.runner)
        if amass.is_available:
            out.info("Amass intel — organization discovery")
            try:
                r = await amass.intel(company)
                amass_domains = set(r.lines())
                discovered.update(amass_domains)
                out.success(f"Amass intel: {len(amass_domains)} results")
            except Exception as e:
                out.warning(f"Amass intel failed: {e}")

        # Merge discovered domains into subdomains
        if discovered:
            scope = self.ctx.scope
            for d in discovered:
                if scope.is_in_scope(d):
                    self.ctx.subdomains.add(d.lower())

        out.info(f"Company workflow discovered {len(discovered)} assets")
        await self._domain_workflow(company)

    async def _domain_workflow(self, domain: str):
        tasks = []
        existing = self.ctx.subdomains or {domain}

        from ..tools.wrappers import ShuffleDNS, DNSx, Naabu, CloudEnum
        import aiohttp

        # ── ShuffleDNS ────────────────────────────────────────────────────
        sdns = ShuffleDNS(self.ctx.runner)
        if sdns.is_available:
            tasks.append(self._resolve_dns(sdns, existing))

        # ── DNSx ──────────────────────────────────────────────────────────
        dx = DNSx(self.ctx.runner)
        if dx.is_available:
            tasks.append(self._dns_records(dx, existing))

        # ── Naabu ─────────────────────────────────────────────────────────
        nb = Naabu(self.ctx.runner)
        if nb.is_available:
            tasks.append(self._port_scan(nb, domain))

        # ── Cloud Enum ────────────────────────────────────────────────────
        ce = CloudEnum(self.ctx.runner)
        if ce.is_available:
            tasks.append(self._cloud_enum(ce, domain))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, set):
                    for sub in r:
                        if sub and sub.lower() not in {s.lower() for s in existing}:
                            if self.ctx.scope.is_in_scope(sub):
                                existing.add(sub)

        self.ctx.subdomains = existing
        out.success(f"Phase 2 complete: {len(existing)} total subdomains")

    async def _resolve_dns(self, tool, subs: set[str]) -> set[str]:
        out.info("ShuffleDNS — mass DNS resolution")
        try:
            r = await tool.resolve("\n".join(subs))
            resolved = set(r.lines())
            out.success(f"ShuffleDNS: {len(resolved)} resolved")

            # Update resolved flag in database
            if resolved:
                from ..database import Subdomain
            from sqlalchemy import update

            async with self.ctx.db_session.begin():
                await self.ctx.db_session.execute(
                    update(Subdomain)
                    .where(Subdomain.target_id == self.ctx.target_id)
                    .where(Subdomain.subdomain.in_(resolved))
                    .values(resolved=True)
                )

            return resolved
        except Exception as e:
            out.warning(f"ShuffleDNS failed: {e}")
            return set()

    async def _dns_records(self, tool, subs: set[str]) -> set[str]:
        out.info("DNSx — record enumeration")
        try:
            r = await tool.resolve("\n".join(subs))
            records = r.json_lines()
            from ..database import DNSRecord
            from sqlalchemy import insert

            rows = []
            for rec in records:
                host = rec.get("host", "")
            rtype = rec.get("type", "A")
            rval = str(
                rec.get("a")
                or rec.get("aaaa")
                or rec.get("cname")
                or rec.get("mx")
                or rec.get("ns")
                or rec.get("txt")
                or ["unknown"]
            )[1:-1]
            rows.append(
                {
                    "target_id": self.ctx.target_id,
                    "domain": host,
                    "record_type": rtype,
                    "record_value": rval[:500],
                    "source": "dnsx",
                }
            )
            if rows:
                async with self.ctx.db_session.begin():
                    await self.ctx.db_session.execute(insert(DNSRecord).values(rows))
            out.success(f"DNSx: {len(records)} records")
            return {r.get("host", "") for r in records if r.get("host")}
        except Exception as e:
            out.warning(f"DNSx failed: {e}")
            return set()

    async def _port_scan(self, tool, domain: str) -> set[str]:
        out.info("Naabu — port scan")
        try:
            r = await tool.scan(domain)
            ports = r.lines()
            out.success(f"Naabu: {len(ports)} open ports")
            return set()
        except Exception as e:
            out.warning(f"Naabu failed: {e}")
            return set()

    async def _cloud_enum(self, tool, domain: str) -> set[str]:
        keyword = domain.split(".")[0]
        out.info(f"Cloud enumeration for keyword: {keyword}")
        try:
            r = await tool.enumerate(keyword)
            assets = r.lines()
            out.success(f"Cloud Enum: {len(assets)} assets")
            return set()
        except Exception as e:
            out.warning(f"Cloud enum failed: {e}")
            return set()
