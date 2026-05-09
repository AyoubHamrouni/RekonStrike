"""Phase 4b: JS Secret Scanning — extract and scan JavaScript files for secrets."""
import json
import logging
import tempfile
from pathlib import Path

from sqlalchemy import select

from . import phase
from ..output import out

logger = logging.getLogger(__name__)


@phase(45, "JS Secret Scanning",
       "Extracts and scans JavaScript files for exposed secrets")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        # 1. Query JS endpoints for this target
        js_urls = await self._query_js_endpoints()
        if not js_urls:
            out.warning("No JS endpoints found to scan")
            return

        out.info(f"Scanning {len(js_urls)} JavaScript files for secrets")

        # 2. Fetch each JS file, run trufflehog, save findings
        from ..tools.wrappers import TrufflehogWrapper

        trufflehog = TrufflehogWrapper(self.ctx.runner)
        if not trufflehog.is_available:
            out.warning("trufflehog not installed — skipping JS secret scanning")
            return

        all_findings: list[dict] = []
        detector_counts: dict[str, int] = {}

        for url in js_urls:
            findings = await self._scan_js_url(url, trufflehog)
            if findings:
                all_findings.extend(findings)
                for f in findings:
                    detector_counts[f["detector_name"]] = detector_counts.get(f["detector_name"], 0) + 1

        # 3. Bulk insert findings
        if all_findings:
            from sqlalchemy import insert
            from ..database import SecretFinding

            async with await self.ctx.db.get_session() as s:
                async with s.begin():
                    stmt = insert(SecretFinding)
                    if self.ctx.settings.db_type == "postgresql":
                        stmt = stmt.on_conflict_do_nothing()
                    else:
                        stmt = stmt.prefix_with("OR IGNORE")
                    await s.execute(stmt.values(all_findings))

        # 4. Report
        out.result("Secrets Found", dict(detector_counts))
        out.success(f"Phase 4b complete: {len(all_findings)} findings across {len(detector_counts)} detector types")

    async def _query_js_endpoints(self) -> list[str]:
        from ..database import Endpoint, LiveHost, Subdomain

        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                rows = await s.execute(
                    select(Endpoint.url).join(LiveHost).join(Subdomain)
                    .where(
                        Subdomain.target_id == self.ctx.target_id,
                        Endpoint.url.like("%.js"),
                    )
                    .limit(200)
                )
                urls = [r[0] for r in rows.fetchall()]

                # Also get JS endpoints by content_type
                content_rows = await s.execute(
                    select(Endpoint.url).join(LiveHost).join(Subdomain)
                    .where(
                        Subdomain.target_id == self.ctx.target_id,
                        Endpoint.content_type.like("%javascript%"),
                        ~Endpoint.url.like("%.js"),
                    )
                    .limit(200)
                )
                content_urls = {r[0] for r in content_rows.fetchall()}

        seen = set()
        result = []
        for url in urls + list(content_urls):
            if url not in seen:
                seen.add(url)
                result.append(url)
        return result[:200]

    async def _scan_js_url(self, url: str, trufflehog) -> list[dict]:
        import aiohttp

        # Fetch JS content
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=5),
                    headers={"User-Agent": "RekonStrike/0.1.0"},
                ) as resp:
                    if resp.status != 200:
                        return []
                    content = await resp.text()
        except Exception as e:
            logger.debug("Failed to fetch %s: %s", url, e)
            return []

        if not content.strip():
            return []

        # Save to temp file
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False)
        try:
            tmp.write(content)
            tmp.close()

            result = await trufflehog.scan_file(tmp.name)
            findings: list[dict] = []
            seen_detectors: set[str] = set()
            for line in result.lines():
                try:
                    finding = json.loads(line)
                except json.JSONDecodeError:
                    continue
                detector = finding.get("DetectorName", "")
                confidence = finding.get("Confidence", 0)
                if not detector or not confidence:
                    continue
                if detector in seen_detectors:
                    continue
                seen_detectors.add(detector)

                raw = finding.get("Raw", "")
                raw_v2 = finding.get("RawV2", "")
                redacted = finding.get("Redacted", raw_v2 or raw)

                findings.append({
                    "target_id": self.ctx.target_id,
                    "source_url": url,
                    "detector_name": detector,
                    "raw_secret": redacted[:500] if redacted else None,
                    "redacted": redacted,
                    "status": "unverified",
                })

            return findings
        finally:
            Path(tmp.name).unlink(missing_ok=True)
