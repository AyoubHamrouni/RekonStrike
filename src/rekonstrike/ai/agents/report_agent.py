import logging
from typing import Dict, Any, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from ..factory import get_llm

logger = logging.getLogger(__name__)

class ReportDrafter:
    """Agent for drafting professional security reports from validated findings."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.llm = get_llm(settings, temperature=0.3)
        
        self.report_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert security technical writer and senior bug bounty researcher. Your objective is to synthesize raw vulnerability data into a professional, submission-ready bug bounty report.

Follow this exact Professional Markdown Template:

# [Vulnerability Type] in [Component/Endpoint]

## Summary
[Provide a 1-2 sentence description. Format: "[Vulnerability Type] in [Component] allows [Attacker] to [Impact] via [Attack Vector]"]

## Severity
- **CVSS Score:** [Calculate based on metrics, e.g., 7.5 (High)]
- **Vector:** [Provide valid CVSS:3.1 vector string]

## Description
[A concise technical explanation of the root cause. Incorporate insights from the {triage_note} and reference relevant CWEs.]

## Affected Asset
- **URL:** {url}
- **Parameter:** [Identify from {details} or state 'N/A']
- **Method:** [Identify from {details}, e.g., GET/POST]

## Steps to Reproduce
1. [Step 1: Technical prerequisite]
2. [Step 2: Specific action/payload injection]
3. [Step 3: Observation of the vulnerability]

## Proof of Concept (PoC)
### Evidence
> [!IMPORTANT]
> [REPLACE THIS LINE WITH SCREENSHOTS/VIDEOS]
> Please attach your proof-of-concept media here (Screenshots, Screen Recordings).

### HTTP Request
```http
[Provide a representative HTTP request snippet if available in {details}]
```

## Impact
[Clearly explain the business and security impact. What can an attacker achieve?]

## Recommended Remediation
[Provide specific, actionable technical advice to patch the root cause.]

CONSTRAINTS:
- DO NOT invent impact scenarios; use only the provided {details}.
- DO NOT include conversational filler. Output ONLY the Markdown.
- Use precise, clinical, and objective language."""),
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
