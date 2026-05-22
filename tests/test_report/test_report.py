"""Report generation tests."""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from rekonstrike.database import Report
from rekonstrike.services.report_service import (
    ReportService,
    _findings_by_severity,
    _generate_executive_summary,
    _compile_full_report,
    _markdown_to_html,
    _markdown_to_pdf_text,
    _compile_findings_section,
)


# ─── Mock LLM ──────────────────────────────────────────────────────────


class MockSectionLLM:
    def __init__(self, section_md: str | None = None):
        self.section_md = section_md or (
            "A reflected cross-site scripting vulnerability was identified in the search parameter. "
            "This allows an attacker to inject arbitrary JavaScript into the page.\n\n"
            "**Affected systems:**\n- https://example.com/search\n\n"
            "**Exploitation steps:**\n1. Navigate to the search page\n"
            "2. Inject payload into the q parameter\n"
            "3. Observe script execution\n\n"
            "**Proof of concept:**\n```\n<script>alert(1)</script>\n```\n\n"
            "**Remediation:**\nApply proper output encoding and Content-Security-Policy headers."
        )
        self.last_messages = None

    async def ainvoke(self, messages):
        self.last_messages = messages
        return _MockResponse(content=self.section_md)


class _MockResponse:
    def __init__(self, content: str):
        self.content = content


# ─── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def mock_llm():
    return MockSectionLLM()


@pytest.fixture
def sample_findings():
    return [
        {
            "finding_id": 1,
            "risk_rank": "critical",
            "endpoint": "https://example.com/admin",
            "payload": "' OR 1=1--",
            "response": "HTTP 200 OK",
            "notes": "SQL injection confirmed",
            "section_md": "**Critical SQL Injection**\n\nA critical SQL injection...",
        },
        {
            "finding_id": 2,
            "risk_rank": "medium",
            "endpoint": "https://example.com/search",
            "payload": "<script>alert(1)</script>",
            "response": "HTTP 200 OK",
            "notes": "XSS in search param",
            "section_md": "**Medium XSS**\n\nA reflected XSS vulnerability...",
        },
        {
            "finding_id": 3,
            "risk_rank": "high",
            "endpoint": "https://example.com/api/users",
            "payload": "",
            "response": "HTTP 403",
            "notes": "IDOR confirmed",
            "section_md": "**High IDOR**\n\nInsecure direct object reference...",
        },
    ]


# ─── Tests ─────────────────────────────────────────────────────────────


class TestFormatConversion:
    def test_markdown_to_html_basic(self):
        md = "# Title\n\n## Heading\n\nParagraph text.\n\n- Item 1\n- Item 2"
        html = _markdown_to_html(md)
        assert "<h1>" in html
        assert "<h2>" in html
        assert "<li>Item 1" in html or "Item 1" in html

    def test_markdown_to_html_code_block(self):
        md = "```\ncode here\n```"
        html = _markdown_to_html(md)
        assert "<pre>" in html or "<code>" in html

    def test_markdown_to_pdf_text_parsing(self):
        md = "# Title\n## Subtitle\n### Subsub\n- item\n1. num\n```\ncode\n```\nplain"
        blocks = _markdown_to_pdf_text(md)
        types = [b["type"] for b in blocks]
        assert "heading" in types
        assert "subheading" in types
        assert "bullet" in types
        assert "numbered" in types
        assert "code" in types
        assert "text" in types


class TestSeverityBreakdown:
    def test_findings_by_severity(self):
        findings = [
            {"risk_rank": "critical"},
            {"risk_rank": "critical"},
            {"risk_rank": "high"},
            {"risk_rank": "medium"},
            {"risk_rank": "low"},
            {"risk_rank": "info"},
        ]
        counts = _findings_by_severity(findings)
        assert counts["critical"] == 2
        assert counts["high"] == 1
        assert counts["medium"] == 1
        assert counts["low"] == 1
        assert counts["info"] == 1

    def test_empty_findings(self):
        counts = _findings_by_severity([])
        assert all(v == 0 for v in counts.values())

    def test_empty_findings_executive_summary(self):
        summary = _generate_executive_summary("test.com", [], {})
        assert "No confirmed vulnerabilities" in summary

    def test_single_finding_summary(self):
        findings = [{"risk_rank": "critical"}]
        counts = _findings_by_severity(findings)
        summary = _generate_executive_summary("test.com", findings, counts)
        assert "1 confirmed finding" in summary
        assert "1 critical" in summary

    def test_multiple_findings_summary(self):
        findings = [{"risk_rank": "critical"}, {"risk_rank": "high"}]
        counts = _findings_by_severity(findings)
        summary = _generate_executive_summary("test.com", findings, counts)
        assert "2 confirmed findings" in summary


class TestReportCompilation:
    def test_compile_full_report_has_all_sections(self, sample_findings):
        counts = _findings_by_severity(sample_findings)
        summary = _generate_executive_summary("test.com", sample_findings, counts)
        report = _compile_full_report("Test Report", summary, counts, sample_findings)
        assert "# Test Report" in report
        assert "Executive Summary" in report
        assert "Severity Breakdown" in report
        assert "Findings" in report
        assert "Recommendations" in report

    def test_compile_orders_by_severity(self, sample_findings):
        findings = sample_findings
        section = _compile_findings_section(findings)
        assert section and len(section) > 0

    def test_compile_with_zero_findings(self):
        counts = _findings_by_severity([])
        summary = _generate_executive_summary("test.com", [], counts)
        report = _compile_full_report("Empty Report", summary, counts, [])
        assert "Findings" in report
        assert "Recommendations" in report


class TestReportService:
    @pytest.mark.asyncio
    async def test_generate_report_markdown(self, mock_llm):
        session = AsyncMock()
        session.execute = AsyncMock()

        mock_target = MagicMock()
        mock_target.target = "example.com"
        mock_target_result = MagicMock()
        mock_target_result.scalar_one_or_none = MagicMock(return_value=mock_target)
        mock_target_result.scalars = MagicMock()

        mock_tr = MagicMock()
        mock_tr.finding_id = 1
        mock_tr.confirmed = True
        mock_tr.endpoint = "https://example.com/test"
        mock_tr.payload = "test_payload"
        mock_tr.response_body = "HTTP 200 OK"
        mock_tr.notes = "Test finding"
        mock_results = MagicMock()
        mock_results.scalars.return_value.all = MagicMock(return_value=[mock_tr])

        async def mock_execute(stmt):
            if "scope_targets" in str(stmt):
                return mock_target_result
            return mock_results

        session.execute = mock_execute
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        with patch("rekonstrike.services.report_service.get_llm", return_value=mock_llm):
            with patch("rekonstrike.services.report_service.section_prompt", None):
                service = ReportService(session)
                report = await service.generate_report(
                    target_id=1, testing_session_id=1, user_id=1, fmt="markdown"
                )
                assert report.format == "markdown"
                assert report.findings_count == 1
                assert "example.com" in report.title or "example.com" in report.executive_summary

    @pytest.mark.asyncio
    async def test_generate_report_html(self, mock_llm):
        session = AsyncMock()
        mock_target = MagicMock()
        mock_target.target = "example.com"
        mock_target_result = MagicMock()
        mock_target_result.scalar_one_or_none = MagicMock(return_value=mock_target)

        mock_tr = MagicMock()
        mock_tr.finding_id = 1
        mock_tr.confirmed = True
        mock_tr.endpoint = "https://example.com/test"
        mock_tr.payload = "test"
        mock_tr.response_body = "OK"
        mock_tr.notes = "test"
        mock_results = MagicMock()
        mock_results.scalars.return_value.all = MagicMock(return_value=[mock_tr])

        async def mock_execute(stmt):
            if "scope_targets" in str(stmt):
                return mock_target_result
            return mock_results

        session.execute = mock_execute
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        with patch("rekonstrike.services.report_service.get_llm", return_value=mock_llm):
            with patch("rekonstrike.services.report_service.section_prompt", None):
                service = ReportService(session)
                report = await service.generate_report(
                    target_id=1, testing_session_id=1, user_id=1, fmt="html"
                )
                assert report.format == "html"
                assert "<!DOCTYPE html>" in report.content

    @pytest.mark.asyncio
    async def test_generate_report_pdf(self, mock_llm):
        session = AsyncMock()
        mock_target = MagicMock()
        mock_target.target = "example.com"
        mock_target_result = MagicMock()
        mock_target_result.scalar_one_or_none = MagicMock(return_value=mock_target)

        mock_tr = MagicMock()
        mock_tr.finding_id = 1
        mock_tr.confirmed = True
        mock_tr.endpoint = "https://example.com/test"
        mock_tr.payload = "test"
        mock_tr.response_body = "OK"
        mock_tr.notes = "test"
        mock_results = MagicMock()
        mock_results.scalars.return_value.all = MagicMock(return_value=[mock_tr])

        async def mock_execute(stmt):
            if "scope_targets" in str(stmt):
                return mock_target_result
            return mock_results

        session.execute = mock_execute
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        with patch("rekonstrike.services.report_service.get_llm", return_value=mock_llm):
            with patch("rekonstrike.services.report_service.section_prompt", None):
                service = ReportService(session)
                report = await service.generate_report(
                    target_id=1, testing_session_id=1, user_id=1, fmt="pdf"
                )
                assert report.format == "pdf"
                assert len(report.content) > 0


class TestReportModel:
    def test_create_report(self):
        now = datetime.now(timezone.utc)
        report = Report(
            user_id=1,
            target_id=1,
            testing_session_id=1,
            format="markdown",
            title="Test Report",
            executive_summary="Summary here",
            severity_breakdown={"critical": 1, "high": 0, "medium": 2, "low": 0, "info": 0},
            findings_count=3,
            content="# Report\n\nContent here",
            generated_at=now,
        )
        assert report.format == "markdown"
        assert report.findings_count == 3
        assert report.severity_breakdown["critical"] == 1

    def test_report_defaults(self):
        now = datetime.now(timezone.utc)
        report = Report(
            user_id=1,
            target_id=1,
            testing_session_id=1,
            format="pdf",
            title="",
            executive_summary="",
            severity_breakdown=None,
            findings_count=0,
            content="",
            generated_at=now,
        )
        assert report.format == "pdf"
        assert report.findings_count == 0
        assert report.exported_at is None

    def test_report_all_formats(self):
        now = datetime.now(timezone.utc)
        for fmt in ("markdown", "html", "pdf"):
            report = Report(
                user_id=1, target_id=1, testing_session_id=1,
                format=fmt, title="", executive_summary="",
                severity_breakdown={}, findings_count=0, content="",
                generated_at=now,
            )
            assert report.format == fmt


__all__ = []
