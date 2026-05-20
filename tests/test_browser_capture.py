"""Tests for BrowserCapture model and browser client integration."""

import pytest
from sqlalchemy import select

from rekonstrike.database import BrowserCapture, ScopeTarget


@pytest.mark.asyncio
async def test_create_browser_capture(db, session):
    target = ScopeTarget(target="example.com", target_type="domain")
    session.add(target)
    await session.flush()

    capture = BrowserCapture(
        target_id=target.id,
        url="https://example.com",
        rendered_html="<html><body>Hello</body></html>",
        network_logs=[
            {"url": "https://example.com/api", "method": "GET", "status": 200}
        ],
        cookies_set=[{"name": "session", "value": "abc123"}],
        execution_time_ms=1234,
    )
    session.add(capture)
    await session.flush()
    assert capture.id is not None
    assert capture.execution_time_ms == 1234


@pytest.mark.asyncio
async def test_browser_capture_with_storage(db, session):
    target = ScopeTarget(target="store.test", target_type="domain")
    session.add(target)
    await session.flush()

    capture = BrowserCapture(
        target_id=target.id,
        url="https://store.test",
        local_storage=[{"origin": "https://store.test", "localStorage": {"key": "val"}}],
        session_storage=[{"origin": "https://store.test", "sessionStorage": {}}],
        javascript_errors=[
            {"message": "TypeError: x is not a function", "source": "https://store.test/app.js", "lineno": 42}
        ],
        js_bundles=[{"url": "https://store.test/app.js", "content": "console.log('hi')"}],
        source_maps=[{"url": "https://store.test/app.js", "source_map_url": "https://store.test/app.js.map"}],
    )
    session.add(capture)
    await session.flush()

    result = await session.execute(
        select(BrowserCapture).where(BrowserCapture.id == capture.id)
    )
    saved = result.scalar_one()
    assert len(saved.local_storage) == 1
    assert len(saved.javascript_errors) == 1
    assert saved.js_bundles[0]["url"] == "https://store.test/app.js"
    assert len(saved.source_maps) == 1


@pytest.mark.asyncio
async def test_browser_capture_scan_session_link(db, session):
    from rekonstrike.database import ScanSession

    target = ScopeTarget(target="session.test", target_type="domain")
    session.add(target)
    await session.flush()

    scan = ScanSession(target_id=target.id, workflow="domain")
    session.add(scan)
    await session.flush()

    capture = BrowserCapture(
        target_id=target.id,
        scan_session_id=scan.id,
        url="https://session.test",
        execution_time_ms=500,
    )
    session.add(capture)
    await session.flush()

    result = await session.execute(
        select(BrowserCapture).where(BrowserCapture.scan_session_id == scan.id)
    )
    matches = result.scalars().all()
    assert len(matches) == 1


@pytest.mark.asyncio
async def test_browser_capture_nullable_fields(db, session):
    target = ScopeTarget(target="minimal.test", target_type="domain")
    session.add(target)
    await session.flush()

    capture = BrowserCapture(
        target_id=target.id,
        url="https://minimal.test",
    )
    session.add(capture)
    await session.flush()
    assert capture.id is not None
    assert capture.rendered_html is None
    assert capture.note is None
    assert capture.screenshot_base64 is None
