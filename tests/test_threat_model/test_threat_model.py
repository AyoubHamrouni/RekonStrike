import pytest

from rekonstrike.ai.schemas.threat_model_input import build_llm_input
from rekonstrike.ai.schemas.threat_model_output import (
    empty_assessment,
    compute_risk_summary,
)
from rekonstrike.ai.agents.threat_model_agent import (
    run_threat_model,
    _validate_against_surface,
    _parse_findings,
)
from .mock_llm import MockThreatLLM
from .fixtures.fixture_builder import FIXTURES


class MockSettings:
    ai_provider = "openai"
    ai_api_keys = {}
    api_keys = {}
    ai_base_urls = {}
    default_ai_model = "gpt-4o-mini"


def _make_mock(surface, golden):
    mock = MockThreatLLM()
    mock.register(surface.model_dump_json(indent=2), golden.model_dump_json())
    return mock


@pytest.mark.parametrize("fixture_name", ["simple_api", "ecommerce", "token_leak"])
@pytest.mark.asyncio
async def test_haiku_tier_matches_golden(fixture_name):
    surface, golden = FIXTURES[fixture_name]
    mock_llm = _make_mock(surface, golden)
    result = await run_threat_model(MockSettings(), surface, tier="haiku", llm=mock_llm)

    assert len(result.findings) == len(golden.findings), (
        f"Finding count mismatch for {fixture_name}: "
        f"got {len(result.findings)}, expected {len(golden.findings)}"
    )

    for i, (actual, expected) in enumerate(zip(result.findings, golden.findings)):
        assert actual.finding_type == expected.finding_type, (
            f"Finding {i} type mismatch in {fixture_name}: "
            f"got {actual.finding_type}, expected {expected.finding_type}"
        )
        assert actual.risk_rank == expected.risk_rank, (
            f"Finding {i} risk rank mismatch in {fixture_name}: "
            f"got {actual.risk_rank}, expected {expected.risk_rank}"
        )
        assert abs(actual.confidence - expected.confidence) < 0.2, (
            f"Finding {i} confidence out of range in {fixture_name}: "
            f"got {actual.confidence}, expected ~{expected.confidence}"
        )
        assert len(actual.affected_endpoints) == len(expected.affected_endpoints), (
            f"Finding {i} endpoint count mismatch in {fixture_name}: "
            f"got {len(actual.affected_endpoints)}, expected {len(expected.affected_endpoints)}"
        )


@pytest.mark.parametrize("fixture_name", ["simple_api", "ecommerce", "token_leak"])
@pytest.mark.asyncio
async def test_opus_tier_matches_golden(fixture_name):
    surface, golden = FIXTURES[fixture_name]
    mock_llm = _make_mock(surface, golden)
    result = await run_threat_model(MockSettings(), surface, tier="opus", llm=mock_llm)

    assert len(result.findings) == len(golden.findings)
    assert result.model_used == "opus"


@pytest.mark.asyncio
async def test_empty_surface_shortcircuit():
    surface, _ = FIXTURES["empty_surface"]
    result = await run_threat_model(MockSettings(), surface)
    assert len(result.findings) == 0
    assert len(result.session_recommendations) > 0
    assert "No web surface captured" in result.session_recommendations[0]


@pytest.mark.asyncio
async def test_hallucination_filtered():
    surface, golden = FIXTURES["simple_api"]

    bad_golden = golden.model_copy(deep=True)
    bad_golden.findings[0].affected_endpoints.append(
        type(bad_golden.findings[0].affected_endpoints[0])(
            method="GET",
            path="/api/nonexistent/endpoint",
            parameters=[],
            evidence="invented",
        )
    )

    mock_llm = MockThreatLLM()
    mock_llm.register(surface.model_dump_json(indent=2), bad_golden.model_dump_json())

    result = await run_threat_model(MockSettings(), surface, tier="haiku", llm=mock_llm)

    assert len(result.findings) < len(bad_golden.findings), (
        "Hallucinated endpoint should have been filtered out"
    )


def test_capping_large_surface():
    raw_captures = []
    for i in range(100):
        for j in range(10):
            raw_captures.append({
                "method": "GET",
                "path": f"/api/resource{i}/item{j}",
                "headers": {"Authorization": "Bearer test"},
                "status_code": 200,
            })

    capped = build_llm_input(raw_captures, max_families=10, max_endpoints_per_family=5)
    total_endpoints = sum(len(f.endpoints) for f in capped.resource_families)
    assert total_endpoints <= 50, f"Capped at {total_endpoints}, expected <= 50"
    assert len(capped.resource_families) <= 10

    capped_haiku = build_llm_input(raw_captures, max_families=20, max_endpoints_per_family=15)
    total = sum(len(f.endpoints) for f in capped_haiku.resource_families)
    assert total <= 300
    assert len(capped_haiku.resource_families) <= 20


def test_input_builder_deduplication():
    raw = [
        {"method": "GET", "path": "/api/users/1", "headers": {}, "status_code": 200},
        {"method": "GET", "path": "/api/users/1", "headers": {}, "status_code": 200},
        {"method": "GET", "path": "/api/users/2", "headers": {}, "status_code": 200},
        {"method": "POST", "path": "/api/users", "headers": {"Authorization": "Bearer x"}, "status_code": 201},
    ]
    result = build_llm_input(raw)
    total = sum(len(f.endpoints) for f in result.resource_families)
    assert total == 3, f"Expected 3 unique endpoints, got {total}"


def test_validation_rejects_invented_endpoints():
    surface = FIXTURES["simple_api"][0]
    assessment = FIXTURES["simple_api"][1].model_copy(deep=True)

    assessment.findings[0].affected_endpoints.append(
        type(assessment.findings[0].affected_endpoints[0])(
            method="GET", path="/api/made/up", parameters=[], evidence="fake"
        )
    )
    assessment.risk_summary = compute_risk_summary(assessment.findings)

    original_count = len(assessment.findings)
    validated = _validate_against_surface(assessment, surface)
    assert len(validated.findings) == original_count - 1, (
        "Should have removed the finding with the invented endpoint"
    )


def test_compute_risk_summary():
    findings = [
        type("F", (), {"risk_rank": "critical"})(),
        type("F", (), {"risk_rank": "high"})(),
        type("F", (), {"risk_rank": "high"})(),
        type("F", (), {"risk_rank": "medium"})(),
    ]
    summary = compute_risk_summary(findings)
    assert summary["critical"] == 1
    assert summary["high"] == 2
    assert summary["medium"] == 1
    assert summary["low"] == 0
    assert summary["info"] == 0


def test_empty_assessment():
    result = empty_assessment(target="test.example.com", model="opus")
    assert result.target == "test.example.com"
    assert result.model_used == "opus"
    assert len(result.findings) == 0


def test_confidence_clamping():
    raw = {
        "findings": [{
            "finding_type": "idor",
            "finding_subtype": "confirmed",
            "risk_rank": "high",
            "affected_endpoints": [{"method": "GET", "path": "/api/test/{id}", "parameters": ["id"], "evidence": ""}],
            "exploitation_description": "test",
            "exploitation_difficulty": "easy",
            "data_at_risk": [],
            "affected_roles": [],
            "confidence": 1.5,
            "recommended_test": "",
            "exploitation_chain": [],
        }],
        "privilege_escalation_chains": [],
        "session_recommendations": [],
    }
    findings = _parse_findings(raw)
    assert findings[0].confidence == 1.0

    raw["findings"][0]["confidence"] = -0.5
    findings = _parse_findings(raw)
    assert findings[0].confidence == 0.0


@pytest.mark.asyncio
async def test_run_threat_model_with_user_answers():
    surface, golden = FIXTURES["simple_api"]
    mock_llm = _make_mock(surface, golden)

    answers = [
        {"question": "Is the admin endpoint validated?", "answer": "No, it uses the same auth as user endpoints"},
    ]
    result = await run_threat_model(MockSettings(), surface, user_answers=answers, tier="haiku", llm=mock_llm)
    assert len(result.findings) > 0


def test_capping_scales_per_tier():
    raw = [{"method": "GET", "path": f"/api/r{i}/e{j}", "headers": {}, "status_code": 200}
           for i in range(50) for j in range(20)]

    haiku = build_llm_input(raw, max_families=20, max_endpoints_per_family=15)
    opus = build_llm_input(raw, max_families=10, max_endpoints_per_family=5)

    haiku_total = sum(len(f.endpoints) for f in haiku.resource_families)
    opus_total = sum(len(f.endpoints) for f in opus.resource_families)

    assert haiku_total > opus_total, "Haiku tier should allow more endpoints than opus tier"
