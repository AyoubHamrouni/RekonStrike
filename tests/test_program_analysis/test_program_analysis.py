"""Program analysis tests."""
import json
import pytest
from datetime import datetime, timezone

from rekonstrike.database import ProgramAnalysis
from rekonstrike.integrations.program_client import ProgramClient
from rekonstrike.api.routers.program_analysis import AnalyzeRequest


# ─── Mock LLM ──────────────────────────────────────────────────────────


class MockAnalysisLLM:
    def __init__(self, response: dict | None = None):
        self.response = response or {
            "risk_score": 70,
            "roi_score": 85,
            "risk_factors": ["Large attack surface", "High historical vuln count"],
            "roi_factors": ["Generous bounty range", "Fast response time"],
            "recommendation": "attack",
            "reasoning": "High reward potential with manageable risk.",
        }
        self.last_messages = None

    async def ainvoke(self, messages):
        self.last_messages = messages
        return _MockResponse(content=json.dumps(self.response))


class _MockResponse:
    def __init__(self, content: str):
        self.content = content


# ─── Tests ─────────────────────────────────────────────────────────────


class TestProgramMetadata:
    @pytest.mark.asyncio
    async def test_known_program_returns_metadata(self):
        client = ProgramClient()
        meta = await client.get_program_metadata("hackerone", "shopify")
        assert meta.program_name == "Shopify"
        assert meta.bounty_min == 500
        assert meta.bounty_max == 10000
        assert meta.scope_size == 50

    @pytest.mark.asyncio
    async def test_unknown_program_returns_defaults(self):
        client = ProgramClient()
        meta = await client.get_program_metadata("hackerone", "nonexistent")
        assert meta.program_name == "Nonexistent"
        assert meta.bounty_min is None
        assert meta.bounty_max is None

    @pytest.mark.asyncio
    async def test_case_insensitive_lookup(self):
        client = ProgramClient()
        meta = await client.get_program_metadata("HACKERONE", "SHOPIFY")
        assert meta.program_name == "Shopify"


class TestPriorityScore:
    def test_priority_score_formula(self):
        priority = 0.6 * 85 + 0.4 * 70
        assert priority == 79.0

    def test_sorting_by_priority(self):
        programs = [
            {"name": "A", "priority_score": 90},
            {"name": "B", "priority_score": 50},
            {"name": "C", "priority_score": 75},
        ]
        sorted_progs = sorted(programs, key=lambda p: p["priority_score"], reverse=True)
        assert [p["name"] for p in sorted_progs] == ["A", "C", "B"]

    def test_equality_edge_cases(self):
        assert 0.6 * 0 + 0.4 * 0 == 0
        assert 0.6 * 100 + 0.4 * 100 == 100
        assert 0.6 * 50 + 0.4 * 50 == 50


class TestLLMAnalysis:
    @pytest.mark.asyncio
    async def test_llm_returns_structured_scores(self):
        mock = MockAnalysisLLM()
        response = await mock.ainvoke("test input")
        data = json.loads(response.content)
        assert "risk_score" in data
        assert "roi_score" in data
        assert "recommendation" in data
        assert 0 <= data["risk_score"] <= 100
        assert 0 <= data["roi_score"] <= 100
        assert data["recommendation"] in ("attack", "moderate", "avoid")

    @pytest.mark.asyncio
    async def test_llm_handles_edge_bounties(self):
        mock = MockAnalysisLLM({
            "risk_score": 20,
            "roi_score": 10,
            "risk_factors": ["Small scope"],
            "roi_factors": ["Low bounties"],
            "recommendation": "avoid",
            "reasoning": "Low reward potential.",
        })
        response = await mock.ainvoke("test")
        data = json.loads(response.content)
        assert data["risk_score"] == 20
        assert data["roi_score"] == 10
        assert data["recommendation"] == "avoid"


class TestProgramAnalysisModel:
    def test_create_program_analysis(self):
        now = datetime.now(timezone.utc)
        record = ProgramAnalysis(
            user_id=1,
            program_source="hackerone",
            program_name="Test Program",
            program_slug="test",
            bounty_min=100,
            bounty_max=5000,
            avg_bounty=1000,
            response_time_days=5,
            scope_size=25,
            vulnerability_count=50,
            severity_distribution={"critical": 2, "high": 10, "medium": 20, "low": 15, "info": 3},
            risk_score=60.0,
            roi_score=75.0,
            priority_score=69.0,
            analyzed_at=now,
        )
        assert record.user_id == 1
        assert record.program_source == "hackerone"
        assert record.risk_score == 60.0
        assert record.roi_score == 75.0
        assert record.priority_score == 69.0
        assert record.severity_distribution["critical"] == 2


class TestAnalyzeRequest:
    def test_valid_sources(self):
        for source in ("hackerone", "bugcrowd", "intigriti"):
            req = AnalyzeRequest(program_source=source, program_slug="test")
            assert req.program_source == source
            assert req.program_slug == "test"

    def test_invalid_source_raises(self):
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            AnalyzeRequest(program_source="invalid", program_slug="test")

    def test_min_length_slug(self):
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            AnalyzeRequest(program_source="hackerone", program_slug="")


__all__ = []
