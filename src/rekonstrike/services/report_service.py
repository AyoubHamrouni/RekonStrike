"""Report service — compiles confirmed findings into professional reports."""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import load_settings
from ..database import TestResult, Report, ScopeTarget

try:
    from ..ai.factory import get_llm
except ImportError:
    class NoopLLM:
        async def ainvoke(self, messages):
            class Response:
                content = ""
            return Response()

    def get_llm(settings, temperature=0.0, **kwargs):
        return NoopLLM()

try:
    from ..ai.prompts.report_section import prompt as section_prompt
except ImportError:
    section_prompt = None

logger = logging.getLogger(__name__)

RISK_LABELS = {0: "critical", 1: "high", 2: "medium", 3: "low", 4: "info"}


def _markdown_to_html(md: str) -> str:
    try:
        import markdown as md_lib
        return md_lib.markdown(md, extensions=["fenced_code", "codehilite"])
    except ImportError:
        lines = []
        in_code = False
        for line in md.split("\n"):
            if line.startswith("```"):
                in_code = not in_code
                if in_code:
                    lines.append("<pre><code>")
                else:
                    lines.append("</code></pre>")
                continue
            if in_code:
                lines.append(line)
                continue
            if line.startswith("# "):
                lines.append(f"<h1>{line[2:]}</h1>")
            elif line.startswith("## "):
                lines.append(f"<h2>{line[3:]}</h2>")
            elif line.startswith("### "):
                lines.append(f"<h3>{line[4:]}</h3>")
            elif line.startswith("- "):
                lines.append(f"<li>{line[2:]}</li>")
            elif line.startswith("1. "):
                lines.append(f"<li>{line[3:]}</li>")
            elif line.strip() == "":
                lines.append("<br>")
            else:
                lines.append(f"<p>{line}</p>")
        return "\n".join(lines)


def _markdown_to_pdf_text(md: str) -> list[dict]:
    blocks = []
    in_code = False
    code_buffer = []
    for line in md.split("\n"):
        if line.startswith("```"):
            if in_code:
                blocks.append({"type": "code", "text": "\n".join(code_buffer)})
                code_buffer = []
            in_code = not in_code
            continue
        if in_code:
            code_buffer.append(line)
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if line.startswith("### "):
            blocks.append({"type": "subheading", "text": line[4:]})
        elif line.startswith("## "):
            blocks.append({"type": "heading", "text": line[3:]})
        elif line.startswith("# "):
            blocks.append({"type": "heading", "text": line[2:]})
        elif line.startswith("- "):
            blocks.append({"type": "bullet", "text": line[2:]})
        elif line.startswith("1. "):
            blocks.append({"type": "numbered", "text": line[3:]})
        elif stripped.startswith("**") and stripped.endswith("**"):
            blocks.append({"type": "bold", "text": stripped.strip("*")})
        else:
            blocks.append({"type": "text", "text": stripped})
    if code_buffer:
        blocks.append({"type": "code", "text": "\n".join(code_buffer)})
    return blocks


def _generate_pdf(content: str) -> bytes:
    try:
        from fpdf import FPDF

        font_dir = "/usr/share/fonts/liberation/"
        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_font("LibSans", "", font_dir + "LiberationSans-Regular.ttf")
        pdf.add_font("LibSans", "B", font_dir + "LiberationSans-Bold.ttf")
        use_font = "LibSans"
    except (ImportError, RuntimeError, FileNotFoundError):
        try:
            from fpdf import FPDF
            pdf = FPDF()
            pdf.add_page()
            pdf.set_auto_page_break(auto=True, margin=20)
            pdf.set_font("Courier", size=10)
            use_font = "Courier"
        except ImportError:
            return content.encode("utf-8")

    blocks = _markdown_to_pdf_text(content)

    for block in blocks:
        if block["type"] == "heading":
            pdf.set_font(use_font, "B", 16 if use_font == "LibSans" else 14)
            pdf.multi_cell(0, 10, block["text"])
            pdf.ln(2)
        elif block["type"] == "subheading":
            pdf.set_font(use_font, "B", 13 if use_font == "LibSans" else 12)
            pdf.multi_cell(0, 8, block["text"])
            pdf.ln(1)
        elif block["type"] == "text":
            pdf.set_font(use_font, "", 11 if use_font == "LibSans" else 10)
            pdf.multi_cell(0, 6, block["text"])
            pdf.ln(1)
        elif block["type"] in ("bullet", "numbered"):
            pdf.set_font(use_font, "", 11 if use_font == "LibSans" else 10)
            prefix = "  - " if block["type"] == "bullet" else "  1. "
            pdf.multi_cell(0, 6, prefix + block["text"])
            pdf.ln(1)
        elif block["type"] == "bold":
            pdf.set_font(use_font, "B", 11 if use_font == "LibSans" else 10)
            pdf.multi_cell(0, 6, block["text"])
            pdf.ln(1)
        elif block["type"] == "code":
            pdf.set_font("Courier", "", 8)
            for line in block["text"].split("\n"):
                pdf.cell(5)
                pdf.cell(0, 4, line)
                pdf.ln()
            pdf.ln(2)

    result = pdf.output(dest="S")
    if isinstance(result, (bytes, bytearray)):
        return bytes(result)
    return result.encode("latin-1", errors="replace")


def _compile_findings_section(findings: list) -> str:
    risk_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    sorted_findings = sorted(findings, key=lambda f: risk_order.get(f.get("risk_rank", "info"), 4))

    sections = []
    for f in sorted_findings:
        sections.append(f.get("section_md", ""))
    return "\n\n---\n\n".join(sections)


def _findings_by_severity(findings: list) -> dict:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    valid_labels = {"critical", "high", "medium", "low", "info"}
    for f in findings:
        rank = f.get("risk_rank", "info")
        if isinstance(rank, str) and rank in valid_labels:
            label = rank
        else:
            label = RISK_LABELS.get(rank, "info")
        counts[label] = counts.get(label, 0) + 1
    return counts


def _generate_executive_summary(target_name: str, findings: list, counts: dict) -> str:
    total = len(findings)
    if total == 0:
        return f"No confirmed vulnerabilities were identified for {target_name} during this testing session."
    sev_parts = [f"{n} {k}" for k, n in sorted(counts.items(), key=lambda x: {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}.get(x[0], 5)) if n > 0]
    sev_str = ", ".join(sev_parts)
    return (
        f"A security assessment was conducted against {target_name}, resulting in "
        f"{total} confirmed finding{'s' if total != 1 else ''} "
        f"({sev_str}). "
        f"This report provides a detailed breakdown of each vulnerability, including "
        f"exploitation steps, proof of concept, and remediation guidance."
    )


def _compile_full_report(
    title: str,
    executive_summary: str,
    severity_breakdown: dict,
    findings: list,
    content_format: str = "markdown",
) -> str:
    total = len(findings)
    sev_table = "| Severity | Count |\n|----------|-------|\n"
    for sev in ("critical", "high", "medium", "low", "info"):
        c = severity_breakdown.get(sev, 0)
        if c > 0:
            sev_table += f"| {sev.title()} | {c} |\n"

    body_parts = [
        f"# {title}",
        "",
        "## Executive Summary",
        executive_summary,
        "",
        "## Severity Breakdown",
        sev_table,
        "",
        f"**Total Findings:** {total}",
        "",
        "## Findings",
    ]

    findings_content = _compile_findings_section(findings)
    if findings_content:
        body_parts.append(findings_content)

    body_parts.extend([
        "",
        "## Recommendations",
        "",
        "- Review and remediate all findings in order of severity.",
        "- Apply security patches and input validation as specified per finding.",
        "- Conduct a re-assessment after remediation to verify fixes.",
        "- Update security policies based on identified vulnerability patterns.",
    ])

    return "\n\n".join(body_parts)


class ReportService:
    def __init__(self, session: AsyncSession, settings=None):
        self.session = session
        self.settings = settings or load_settings()

    async def generate_report(
        self,
        target_id: int,
        testing_session_id: int,
        user_id: int,
        fmt: str = "markdown",
    ) -> Report:
        stmt = select(ScopeTarget).where(ScopeTarget.id == target_id)
        target_result = await self.session.execute(stmt)
        target = target_result.scalar_one_or_none()
        target_name = target.target if target else f"Target #{target_id}"

        stmt = select(TestResult).where(
            TestResult.testing_session_id == testing_session_id,
            TestResult.confirmed,
        )
        result = await self.session.execute(stmt)
        test_results = result.scalars().all()

        llm = get_llm(self.settings, temperature=0.0, tier="fast")

        logger.info(
            "Generating report for target %s, session %s: %d confirmed findings",
            target_id, testing_session_id, len(test_results),
        )

        findings_data = []
        for tr in test_results:
            section_md = ""
            if section_prompt is not None:
                try:
                    messages = section_prompt.format_messages(
                        finding_title=f"Finding #{tr.finding_id}",
                        risk="high" if tr.confirmed else "info",
                        endpoints=tr.endpoint,
                        description=tr.notes or "No description provided.",
                        data_at_risk="Sensitive data exposure confirmed via testing.",
                        payload=tr.payload or "See PoC",
                        response=(tr.response_body or "")[:500],
                        notes=tr.notes or "",
                    )
                    llm_response = await llm.ainvoke(messages)
                    raw = llm_response.content if hasattr(llm_response, "content") else str(llm_response)
                    section_md = raw.strip()
                except Exception as e:
                    logger.warning("LLM section generation failed for finding %s: %s", tr.finding_id, e)
                    section_md = (
                        f"{'Vulnerability description:'}\n"
                        f"Confirmed finding on {tr.endpoint}.\n\n"
                        f"**Affected systems:**\n- {tr.endpoint}\n\n"
                        f"**Exploitation steps:**\n1. Access the endpoint at {tr.endpoint}\n"
                        f"2. Submit the test payload\n\n"
                        f"**Proof of concept:**\n```\n{tr.payload or 'N/A'}\n```\n\n"
                        f"**Remediation:**\nApply appropriate input validation and access controls."
                    )
            else:
                section_md = f"Finding #{tr.finding_id} on {tr.endpoint}"

            findings_data.append({
                "finding_id": tr.finding_id,
                "risk_rank": "high" if tr.confirmed else "info",
                "endpoint": tr.endpoint,
                "payload": tr.payload or "",
                "response": tr.response_body or "",
                "notes": tr.notes or "",
                "section_md": section_md,
            })

        severity_breakdown = _findings_by_severity(findings_data)
        executive_summary = _generate_executive_summary(target_name, findings_data, severity_breakdown)
        report_title = f"Security Assessment Report — {target_name}"

        full_md = _compile_full_report(report_title, executive_summary, severity_breakdown, findings_data, "markdown")

        if fmt == "html":
            html_body = _markdown_to_html(full_md)
            content = (
                "<!DOCTYPE html><html><head>"
                "<meta charset='utf-8'><title>%s</title>"
                "<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;"
                "padding:0 20px;line-height:1.6}pre{background:#f4f4f4;padding:10px;"
                "border-radius:4px;overflow-x:auto}code{background:#f4f4f4;padding:2px 4px}"
                "h1,h2,h3{color:#1a1a1a}</style></head><body>%s</body></html>"
            ) % (report_title, html_body)
        elif fmt == "pdf":
            content = _generate_pdf(full_md)
        else:
            content = full_md

        severity_breakdown_data = {
            "critical": severity_breakdown.get("critical", 0),
            "high": severity_breakdown.get("high", 0),
            "medium": severity_breakdown.get("medium", 0),
            "low": severity_breakdown.get("low", 0),
            "info": severity_breakdown.get("info", 0),
        }

        report = Report(
            user_id=user_id,
            target_id=target_id,
            testing_session_id=testing_session_id,
            format=fmt,
            title=report_title,
            executive_summary=executive_summary,
            severity_breakdown=severity_breakdown_data,
            findings_count=len(findings_data),
            content=content if isinstance(content, str) else content.decode("latin-1", errors="replace"),
            generated_at=datetime.now(timezone.utc),
        )
        self.session.add(report)
        await self.session.commit()
        await self.session.refresh(report)

        return report


__all__ = ["ReportService"]
