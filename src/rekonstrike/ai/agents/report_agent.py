import logging
from typing import Dict, Any, Optional

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

class ReportDrafter:
    """Agent for drafting professional security reports from validated findings."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.llm = ChatOpenAI(
            model=settings.default_ai_model,
            openai_api_key=settings.ai_api_keys.get("openai"),
            temperature=0.3
        )
        
        self.report_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert security technical writer. Synthesize the provided raw vulnerability data and AI triage notes into a professional bug bounty report.

Follow this exact Markdown template structure:
# Title: [A concise, actionable title]

## Description
[Objective explanation of the vulnerability and its root cause. Incorporate insights from the {triage_note}.]

## Impact
[Realistic assessment of what an attacker could achieve. Do not exaggerate. Rely only on the provided {details}.]

## Steps to Reproduce
1. [Clear, step-by-step instructions]
2. [Include specific HTTP requests, cURL commands, or payloads from the {details}]

## Remediation
[Actionable fix tailored to the vulnerability class.]

CONSTRAINTS:
- DO NOT invent impact scenarios (e.g., do not claim RCE if the finding is just an exposed API key).
- DO NOT include conversational filler ("Here is your report:"). Output ONLY the Markdown.
- Ensure the tone is clinical and objective."""),
            ("user", """Draft a report for the following finding:

Target URL: {url}
Vulnerability Name: {name}
Template ID: {template_id}
Severity: {severity}
Technical Details: {details}
Triage Note: {triage_note}

Draft the report now:""")
        ])
        
        self.chain = self.report_prompt | self.llm | StrOutputParser()

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
