"""Phase 5: Vulnerability scanning with Nuclei"""

import json
from . import phase
from ..output import out


@phase(5, "Vulnerability Scanning", "Automated vulnerability assessment with Nuclei")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        from ..database import LiveHost

        async with self.ctx.db_session.begin():
            rows = await self.ctx.db_session.execute(
                LiveHost.__table__.select()
                .where(LiveHost.status_code == 200)
                .limit(100)
            )
            targets = [r.url for r in rows.fetchall()]

        if not targets:
            # Fall back to context live hosts
            targets = [h.get("url", "") for h in self.ctx.live_hosts if h.get("url")]

        if not targets:
            out.warning("No targets to scan")
            return

        out.info(f"Nuclei scanning {len(targets)} targets")
        from ..tools.wrappers import Nuclei

        n = Nuclei(self.ctx.runner)
        if not n.is_available:
            out.warning("nuclei not installed — skipping")
            return

        result = await n.scan("\n".join(targets))
        findings = result.json_lines()

        from ..database import Vulnerability
        from sqlalchemy import insert

        vuln_rows = []
        for finding in findings:
            info = finding.get("info", {})
            vuln_rows.append(
                {
                    "template_id": finding.get("template-id"),
                    "name": info.get("name", "Unknown"),
                    "severity": info.get("severity", "unknown"),
                    "description": info.get("description", ""),
                    "matched_at": finding.get("matched-at", ""),
                    "curl_command": finding.get("curl-command", ""),
                }
            )
        if vuln_rows:
            async with self.ctx.db_session.begin():
                await self.ctx.db_session.execute(
                    insert(Vulnerability).values(vuln_rows)
                )
        vuln_count = len(vuln_rows)

        severities = {}
        for f in findings:
            sev = f.get("info", {}).get("severity", "unknown")
            severities[sev] = severities.get(sev, 0) + 1

        if severities:
            out.table(
                "Vulnerabilities by Severity",
                ["Severity", "Count"],
                [[s, str(c)] for s, c in sorted(severities.items())],
            )

        out.success(f"Phase 5 complete: {vuln_count} vulnerabilities found")
