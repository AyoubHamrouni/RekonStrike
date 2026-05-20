"""Phase 7: Intelligence Layer — AI-driven analysis of scan results"""

import logging
from . import phase
from ..output import out
from ..ai import analyze_surface, run_triage, get_test_suggestions

logger = logging.getLogger(__name__)

@phase(7, "AI Intelligence", "Automated triage, pattern recognition, and testing advice")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        # 1. Attack Surface Analysis
        await self._run_surface_analysis()
        
        # 2. Vulnerability Triage
        await self._run_vuln_triage()
        
        # 3. Manual Testing Advice
        await self._run_advisor()

    async def _run_surface_analysis(self):
        out.info("Analyzing attack surface patterns...")
        from ..database import Subdomain, LiveHost
        from sqlalchemy import select
        
        # Fetch data for analysis
        async with self.ctx.db_session.begin():
            sub_rows = await self.ctx.db_session.execute(
                select(Subdomain.subdomain).where(Subdomain.target_id == self.ctx.target_id)
            )
            subdomains = [r[0] for r in sub_rows.fetchall()]
            
            host_rows = await self.ctx.db_session.execute(
                select(LiveHost.url, LiveHost.title, LiveHost.technologies)
                .where(LiveHost.subdomain_id.in_(
                    select(Subdomain.id).where(Subdomain.target_id == self.ctx.target_id)
                ))
            )
            live_hosts = [
                {"url": r[0], "title": r[1], "technologies": r[2]} 
                for r in host_rows.fetchall()
            ]

        if not subdomains:
            return

        result = await analyze_surface(self.ctx.settings, subdomains, live_hosts)
        anomalies = result.get("prioritized_targets", []) or result.get("anomalous_targets", [])
        
        if anomalies:
            out.table(
                "Anomalous Targets Identified",
                ["Subdomain", "Priority", "Reason"],
                [[a["subdomain"], str(a["priority"]), a["reason"]] for a in anomalies]
            )
            # Store in AI insights (logic to be implemented in repository)
            # await self._store_insight("surface", result)

    async def _run_vuln_triage(self):
        out.info("Triaging vulnerability findings...")
        from ..database import Vulnerability, LiveHost
        from sqlalchemy import select, update
        
        async with self.ctx.db_session.begin():
            # Triage High/Critical findings
            stmt = select(Vulnerability, LiveHost.url).join(LiveHost).where(
                Vulnerability.severity.in_(["high", "critical"])
            )
            rows = await self.ctx.db_session.execute(stmt)
            to_triage = rows.fetchall()

        if not to_triage:
            out.info("No high-severity findings to triage.")
            return

        out.info(f"AI triaging {len(to_triage)} findings...")
        for vuln, url in to_triage:
            finding_dict = {
                "name": vuln.name,
                "template_id": vuln.template_id,
                "severity": vuln.severity,
                "matched_at": vuln.matched_at
            }
            
            # Call the triage agent
            result = await run_triage(self.ctx.settings, finding_dict, url)
            
            # Update the vulnerability record with AI verdict
            async with self.ctx.db_session.begin():
                await self.ctx.db_session.execute(
                    update(Vulnerability)
                    .where(Vulnerability.id == vuln.id)
                    .values(
                        fp_score=result.get("confidence", 0.5) if result.get("likely_false_positive") else 1.0,
                        description=f"{vuln.description}\n\n[AI Triage]: {result.get('triage_note')}"
                    )
                )

    async def _run_advisor(self):
        out.info("Generating manual testing suggestions...")
        from ..database import LiveHost
        from sqlalchemy import select
        
        async with self.ctx.db_session.begin():
            # Get top 3 live hosts by ROI or just first 3 for now
            stmt = select(LiveHost).limit(3)
            rows = await self.ctx.db_session.execute(stmt)
            hosts = rows.scalars().all()

        for host in hosts:
            # For each host, get suggestions for a common module like 'injection'
            suggestions = await get_test_suggestions(
                self.ctx.settings,
                host.__dict__, 
                module="injection", 
                discovered_endpoints=[]
            )
            if suggestions:
                out.success(f"Generated {len(suggestions)} testing angles for {host.url}")
                # Store suggestions in database (logic to be implemented)
