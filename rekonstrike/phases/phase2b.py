"""Phase 2b: Subdomain Takeover Detection — checks resolved subdomains for CNAME-based takeovers."""

from sqlalchemy import select

from . import phase
from ..output import out
from ..takeover_signatures import SIGNATURES


@phase(25, "Takeover Detection",
       "Checks resolved subdomains for subdomain takeover vulnerability")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        # 1. Query resolved subdomains for this target
        from ..database import Subdomain

        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                rows = await s.execute(
                    select(Subdomain.id, Subdomain.subdomain).where(
                        Subdomain.target_id == self.ctx.target_id,
                        Subdomain.resolved,
                    )
                )
                subs = {(r[0], r[1]) for r in rows.fetchall()}

        if not subs:
            out.warning("No resolved subdomains to check for takeovers")
            return

        out.info(f"Checking {len(subs)} resolved subdomains for takeovers")
        findings: list[dict] = []
        vulns: list[dict] = []

        for sub_id, subdomain in subs:
            result = await self._check_takeover(sub_id, subdomain)
            if result:
                findings.append(result["finding"])
                if result["vuln"]:
                    vulns.append(result["vuln"])

        # 3. Bulk insert findings
        if findings:
            from sqlalchemy import insert
            from ..database import TakeoverFinding, Vulnerability

            async with await self.ctx.db.get_session() as s:
                async with s.begin():
                    stmt = insert(TakeoverFinding)
                    if self.ctx.settings.db_type == "postgresql":
                        stmt = stmt.on_conflict_do_nothing()
                    else:
                        stmt = stmt.prefix_with("OR IGNORE")
                    await s.execute(stmt.values(findings))

                    if vulns:
                        vstmt = insert(Vulnerability)
                        if self.ctx.settings.db_type == "postgresql":
                            vstmt = vstmt.on_conflict_do_nothing()
                        else:
                            vstmt = vstmt.prefix_with("OR IGNORE")
                        await s.execute(vstmt.values(vulns))

        services = {f["service"] for f in findings}
        out.result("Takeover Findings", sorted(services))
        out.success(f"Phase 2b complete: {len(findings)} takeover(s) found")

    async def _check_takeover(self, sub_id: int, subdomain: str) -> dict | None:
        # 2a. Run dnsx to get CNAME record
        cname = await self._get_cname(subdomain)
        if not cname:
            return None

        cname_lower = cname.lower()

        # 2b. Match CNAME against signatures
        for service_name, sig in SIGNATURES.items():
            if not any(p in cname_lower for p in sig["cname_patterns"]):
                continue

            # 2c. HTTP probe
            http_result = await self._http_probe(subdomain)
            if not http_result:
                continue

            body_lower = http_result["body"].lower()
            fingerprint_lower = sig["fingerprint"].lower()
            status_code = http_result["status_code"]

            if fingerprint_lower not in body_lower:
                continue
            if status_code not in sig["status_codes"]:
                continue

            # Match — create finding and vulnerability
            finding = {
                "subdomain_id": sub_id,
                "service": service_name,
                "cname_value": cname,
                "fingerprint_matched": sig["fingerprint"],
                "confidence": sig["confidence"],
                "status_code": status_code,
            }

            vuln = {
                "live_host_id": None,
                "template_id": "rs-takeover-001",
                "name": f"Subdomain takeover: {service_name}",
                "severity": "critical",
                "description": (
                    f"Subdomain takeover detected on {subdomain}. "
                    f"CNAME points to {cname} ({service_name}). "
                    f"Response: {status_code}, fingerprint: {sig['fingerprint']}"
                ),
                "matched_at": subdomain,
            }

            return {"finding": finding, "vuln": vuln}

        return None

    async def _get_cname(self, subdomain: str) -> str | None:
        from ..tools.wrappers import DNSx

        dnsx = DNSx(self.ctx.runner)
        if not dnsx.is_available:
            return None

        try:
            result = await dnsx.execute(["-d", subdomain, "-cname", "-json", "-silent"])
            for line in result.lines():
                import json
                try:
                    data = json.loads(line)
                    cname = data.get("cname", "")
                    if cname:
                        return cname.rstrip(".")
                except json.JSONDecodeError:
                    continue
        except Exception as e:
            out.warning(f"dnsx failed for {subdomain}: {e}")

        return None

    async def _http_probe(self, subdomain: str) -> dict | None:
        import aiohttp

        for scheme in ("https", "http"):
            url = f"{scheme}://{subdomain}"
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        allow_redirects=False,
                        headers={"User-Agent": "RekonStrike/0.1.0"},
                    ) as resp:
                        return {
                            "status_code": resp.status,
                            "body": await resp.text(),
                        }
            except Exception:
                continue
        return None
