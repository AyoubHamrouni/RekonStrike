"""Phase 6: Reporting — ROI scoring, attack surface map, JSON report"""

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, func

from . import phase
from ..output import out
from ..scoring import Scorer
from ..database import LiveHost, Vulnerability, Subdomain


@phase(
    6,
    "Reporting & ROI Analysis",
    "ROI scoring, attack surface mapping, report generation",
)
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        out.info("Calculating ROI scores and generating report")

        from ..database import TakeoverFinding, SecretFinding

        async with self.ctx.db_session.begin():
            rows = await self.ctx.db_session.execute(LiveHost.__table__.select())
            hosts = [dict(r._mapping) for r in rows.fetchall()]

            # Pre-query takeover findings per subdomain
            take_rows = await self.ctx.db_session.execute(
                select(
                    TakeoverFinding.subdomain_id, func.count().label("cnt")
                ).group_by(TakeoverFinding.subdomain_id)
            )
            takeover_counts = {r.subdomain_id: r.cnt for r in take_rows.fetchall()}

            # Pre-query secret findings for this target
            secret_count = await self.ctx.db_session.execute(
                select(func.count())
                .select_from(SecretFinding)
                .where(SecretFinding.target_id == self.ctx.target_id)
            )
            total_secrets = secret_count.scalar() or 0

        # Get program data from settings or target's ProgramScope
        program = await self._get_program_data()

        scored: list[tuple[int, str, list[str]]] = []
        for host in hosts:
            sub_id = host.get("subdomain_id")
            host["takeover_findings"] = [1] * takeover_counts.get(sub_id, 0)
            host["secret_findings"] = [1] * (total_secrets if sub_id else 0)
            score, signals = Scorer.score(host, program)
            host["roi_score"] = score
            scored.append((score, host.get("url", ""), signals))

        scored.sort(reverse=True)

        if scored:
            out.table(
                "Top Assets by ROI Score",
                ["Score", "URL", "Signals"],
                [[str(s), u[:60], ", ".join(sig[:3])] for s, u, sig in scored[:15]],
            )
            out.stat("Highest ROI", f"{scored[0][0]} — {scored[0][1]}")

        # ── Generate Report ──────────────────────────────────────────────
        sub_count = await self.ctx.db.count(
            Subdomain, session=self.ctx.db_session, target_id=self.ctx.target_id
        )
        live_count = await self.ctx.db.count(
            LiveHost, session=self.ctx.db_session, target_id=self.ctx.target_id
        )
        vuln_count = await self.ctx.db.count(Vulnerability, session=self.ctx.db_session)

        report = {
            "framework": "RekonStrike",
            "version": "0.1.0",
            "target": self.ctx.target,
            "target_type": self.ctx.target_type,
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "subdomains": sub_count,
                "live_hosts": live_count,
                "vulnerabilities": vuln_count,
            },
            "top_assets": [
                {"url": u, "roi_score": s, "signals": sig} for s, u, sig in scored[:25]
            ],
            "config_snapshot": self.ctx.settings.model_dump(mode="json"),
        }

        report_dir = Path(self.ctx.settings.data_dir)
        report_dir.mkdir(parents=True, exist_ok=True)
        fname = f"rekonstrike_{self.ctx.target}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        path = report_dir / fname
        path.write_text(json.dumps(report, indent=2))

        out.success(f"Report saved: {path}")
        out.success("Phase 6 complete")

    async def _get_program_data(self) -> dict | None:
        from ..database import ProgramScope

        async with self.ctx.db_session.begin():
            row = await self.ctx.db_session.execute(
                select(ProgramScope).where(ProgramScope.target_id == self.ctx.target_id)
            )
            p = row.scalar_one_or_none()
            if p:
                return {
                    "platform": p.platform,
                    "program_handle": p.program_handle,
                    "bounty_min": p.bounty_min,
                    "bounty_max": p.bounty_max,
                }
        return None
