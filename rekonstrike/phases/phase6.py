"""Phase 6: Reporting — ROI scoring, attack surface map, JSON report"""
import json
from datetime import datetime
from pathlib import Path

from . import phase
from ..output import out
from ..scoring import Scorer
from ..database import LiveHost, Vulnerability, Subdomain


@phase(6, "Reporting & ROI Analysis",
       "ROI scoring, attack surface mapping, report generation")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        out.info("Calculating ROI scores and generating report")

        from ..database import LiveHost, Subdomain
        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                rows = await s.execute(
                    LiveHost.__table__.select()
                )
                hosts = [dict(r._mapping) for r in rows.fetchall()]

        scored: list[tuple[int, str, list[str]]] = []
        for host in hosts:
            score, signals = Scorer.score(host)
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
        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                sub_count = await self.ctx.db.count(Subdomain, target_id=self.ctx.target_id)
                live_count = await self.ctx.db.count(LiveHost)
                vuln_count = await self.ctx.db.count(Vulnerability)

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
                {"url": u, "roi_score": s, "signals": sig}
                for s, u, sig in scored[:25]
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
