"""Tests for the testing workspace API router."""

import pytest
from sqlalchemy import select

from rekonstrike.database import TestingSession, TestResult, ScopeTarget, AIInsight


@pytest.mark.asyncio
async def test_create_testing_session(db, session):
    target = ScopeTarget(target="test.example.com", target_type="domain")
    session.add(target)
    await session.flush()

    ts = TestingSession(target_id=target.id, status="active")
    session.add(ts)
    await session.flush()

    assert ts.id is not None
    assert ts.status == "active"
    assert ts.findings_tested == 0
    assert ts.findings_confirmed == 0
    assert ts.completed_at is None


@pytest.mark.asyncio
async def test_create_testing_session_with_threat_model(db, session):
    target = ScopeTarget(target="tm.test", target_type="domain")
    session.add(target)
    await session.flush()

    insight = AIInsight(
        target_id=target.id,
        insight_type="threat_model",
        input_hash="abc123",
        model_used="haiku",
        result={
            "findings": [
                {
                    "finding_type": "IDOR",
                    "risk_rank": "critical",
                    "affected_endpoints": [{"method": "GET", "path": "/api/users/{id}"}],
                    "exploitation_description": "IDOR vulnerability",
                }
            ]
        },
    )
    session.add(insight)
    await session.flush()

    ts = TestingSession(
        target_id=target.id,
        threat_model_id=insight.id,
        status="active",
    )
    session.add(ts)
    await session.flush()

    assert ts.threat_model_id == insight.id


@pytest.mark.asyncio
async def test_submit_test_result(db, session):
    target = ScopeTarget(target="result.test", target_type="domain")
    session.add(target)
    await session.flush()

    ts = TestingSession(target_id=target.id, status="active")
    session.add(ts)
    await session.flush()

    result = TestResult(
        testing_session_id=ts.id,
        finding_id=0,
        endpoint="GET /api/test",
        payload="id=1",
        response_status=200,
        confirmed=True,
        notes="Confirmed IDOR",
    )
    session.add(result)
    await session.flush()

    assert result.id is not None
    assert result.confirmed is True
    assert result.response_status == 200


@pytest.mark.asyncio
async def test_update_session_status(db, session):
    target = ScopeTarget(target="status.test", target_type="domain")
    session.add(target)
    await session.flush()

    ts = TestingSession(target_id=target.id, status="active")
    session.add(ts)
    await session.flush()

    ts.status = "completed"
    from datetime import datetime, timezone
    ts.completed_at = datetime.now(timezone.utc)
    await session.flush()

    result = await session.execute(
        select(TestingSession).where(TestingSession.id == ts.id)
    )
    updated = result.scalar_one()
    assert updated.status == "completed"
    assert updated.completed_at is not None


@pytest.mark.asyncio
async def test_session_finding_counts(db, session):
    target = ScopeTarget(target="counts.test", target_type="domain")
    session.add(target)
    await session.flush()

    ts = TestingSession(target_id=target.id, status="active")
    session.add(ts)
    await session.flush()

    # Add 2 confirmed, 1 dismissed
    for i in range(3):
        r = TestResult(
            testing_session_id=ts.id,
            finding_id=i,
            endpoint=f"GET /api/{i}",
            payload="test",
            response_status=200,
            confirmed=i < 2,
        )
        session.add(r)
    await session.flush()

    from sqlalchemy import func

    tested = await session.scalar(
        select(func.count(TestResult.id)).where(
            TestResult.testing_session_id == ts.id
        )
    )
    confirmed = await session.scalar(
        select(func.count(TestResult.id)).where(
            TestResult.testing_session_id == ts.id,
            TestResult.confirmed.is_(True),
        )
    )
    assert tested == 3
    assert confirmed == 2


@pytest.mark.asyncio
async def test_test_result_nullable_fields(db, session):
    target = ScopeTarget(target="nullable.test", target_type="domain")
    session.add(target)
    await session.flush()

    ts = TestingSession(target_id=target.id, status="active")
    session.add(ts)
    await session.flush()

    # Minimal test result
    result = TestResult(
        testing_session_id=ts.id,
        finding_id=0,
        endpoint="GET /api/test",
        response_status=0,
        confirmed=False,
    )
    session.add(result)
    await session.flush()
    assert result.id is not None
    assert result.response_body is None
    assert result.notes is None
