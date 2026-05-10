"""Database model and connection tests."""
import pytest
from sqlalchemy import select

from rekonstrike.database import (
    ScopeTarget, Subdomain, LiveHost, Vulnerability,
    ScanSession,
)


@pytest.mark.asyncio
async def test_create_target(db, session):
    target = ScopeTarget(target="example.com", target_type="domain")
    session.add(target)
    await session.flush()
    assert target.id is not None
    assert target.target == "example.com"


@pytest.mark.asyncio
async def test_create_subdomain(db, session):
    target = ScopeTarget(target="test.com", target_type="domain")
    session.add(target)
    await session.flush()

    sub = Subdomain(target_id=target.id, subdomain="www.test.com", source="passive")
    session.add(sub)
    await session.flush()
    assert sub.id is not None
    assert sub.resolved is False


@pytest.mark.asyncio
async def test_unique_subdomain_constraint(db, session):
    target = ScopeTarget(target="unique.com", target_type="domain")
    session.add(target)
    await session.flush()

    session.add(Subdomain(target_id=target.id, subdomain="sub.unique.com", source="passive"))
    await session.flush()

    with pytest.raises(Exception):
        session.add(Subdomain(target_id=target.id, subdomain="sub.unique.com", source="passive"))
        await session.flush()


@pytest.mark.asyncio
async def test_live_host_with_target(db, session):
    target = ScopeTarget(target="example.com", target_type="domain")
    session.add(target)
    await session.flush()

    host = LiveHost(target_id=target.id, url="https://example.com", roi_score=50)
    session.add(host)
    await session.flush()
    assert host.roi_score == 50
    assert host.target_id == target.id


@pytest.mark.asyncio
async def test_vulnerability_with_target(db, session):
    target = ScopeTarget(target="vuln.test", target_type="domain")
    session.add(target)
    await session.flush()

    vuln = Vulnerability(target_id=target.id, name="Test Vuln", severity="critical")
    session.add(vuln)
    await session.flush()
    assert vuln.severity == "critical"
    assert vuln.target_id == target.id


@pytest.mark.asyncio
async def test_session_status_tracking(db, session):
    target = ScopeTarget(target="session.test", target_type="domain")
    session.add(target)
    await session.flush()

    scan = ScanSession(
        target_id=target.id,
        workflow="domain",
        status="running",
    )
    session.add(scan)
    await session.flush()
    assert scan.status == "running"

    scan.status = "completed"
    await session.flush()

    result = await session.execute(
        select(ScanSession).where(ScanSession.id == scan.id)
    )
    updated = result.scalar_one()
    assert updated.status == "completed"
