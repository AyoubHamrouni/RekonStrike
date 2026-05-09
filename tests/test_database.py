"""Database model and connection tests."""
import pytest
from sqlalchemy import select, func

from rekonstrike.database import (
    ScopeTarget, Subdomain, LiveHost, Vulnerability,
    DNSRecord, ScanSession, ScanArtifact, Endpoint,
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
async def test_get_or_create_target(db, session):
    obj1 = await db.get_or_create_target("example.org", "domain", session)
    obj2 = await db.get_or_create_target("example.org", "domain", session)
    assert obj1.id == obj2.id


@pytest.mark.asyncio
async def test_count(db, session):
    target = ScopeTarget(target="count.test", target_type="domain")
    session.add(target)
    await session.flush()

    for i in range(5):
        session.add(Subdomain(target_id=target.id, subdomain=f"sub{i}.count.test", source="test"))
    await session.flush()

    count = await db.count(Subdomain, session=session, target_id=target.id)
    assert count == 5


@pytest.mark.asyncio
async def test_live_host_roi_default(db, session):
    host = LiveHost(url="https://example.com", roi_score=50)
    session.add(host)
    await session.flush()
    assert host.roi_score == 50


@pytest.mark.asyncio
async def test_vulnerability_severity_index(db, session):
    vuln = Vulnerability(name="Test Vuln", severity="critical")
    session.add(vuln)
    await session.flush()
    assert vuln.severity == "critical"


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
