import logging
from typing import Dict, Any, Optional

from langchain_core.output_parsers import StrOutputParser

from ..factory import get_llm
from ..prompts.report import prompt

logger = logging.getLogger(__name__)

class ReportDrafter:
    """Agent for drafting professional security reports from validated findings."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.llm = get_llm(settings, temperature=0.0)
        self.chain = prompt | self.llm | StrOutputParser()

    async def draft_report(self, finding: Dict[str, Any], url: str, triage_note: Optional[str] = None) -> str:
        """Generates a markdown report for a given finding."""
        try:
            report = await self.chain.ainvoke({
                "url": url,
                "name": finding.get("name", "Unknown"),
                "template_id": finding.get("template_id", "N/A"),
                "severity": finding.get("severity", "unknown"),
                "details": finding.get("description", "No details provided"),
                "triage_note": triage_note or "N/A"
            })
            return report
        except Exception as e:
            logger.error(f"Failed to draft report: {e}")
            return "Error generating report."

async def run_report_drafter(settings: Any, finding: Dict[str, Any], url: str, triage_note: Optional[str] = None) -> str:
    drafter = ReportDrafter(settings)
    return await drafter.draft_report(finding, url, triage_note)
