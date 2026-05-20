"""Tests for BrowserClient HTTP client."""

import pytest

from rekonstrike.integrations.browser_client import BrowserCaptureRequest, BrowserCaptureResult


def test_browser_capture_request_defaults():
    req = BrowserCaptureRequest(target_url="https://example.com")
    assert req.target_url == "https://example.com"
    assert req.scope is None
    assert req.capture_screenshot is False
    assert req.wait_for is None


def test_browser_capture_request_with_fields():
    req = BrowserCaptureRequest(
        target_url="https://test.com",
        scope=["*.test.com"],
        capture_screenshot=True,
        wait_for=".main",
    )
    assert req.scope == ["*.test.com"]
    assert req.capture_screenshot is True
    assert req.wait_for == ".main"


def test_browser_capture_result_defaults():
    result = BrowserCaptureResult(target_url="https://example.com", captured_at="2024-01-01T00:00:00Z")
    assert result.rendered_html == ""
    assert result.network_logs == []
    assert result.javascript_errors == []
    assert result.screenshot_base64 is None
    assert result.note is None


def test_browser_capture_result_from_dict():
    data = {
        "target_url": "https://example.com",
        "captured_at": "2024-01-01T00:00:00Z",
        "rendered_html": "<html></html>",
        "network_logs": [{"url": "https://example.com", "method": "GET", "status": 200}],
        "cookies_set": [],
        "local_storage": [],
        "session_storage": [],
        "javascript_errors": [],
        "execution_time_ms": 1500,
        "js_bundles": [],
        "source_maps": [],
    }
    result = BrowserCaptureResult(**data)
    assert result.rendered_html == "<html></html>"
    assert len(result.network_logs) == 1
    assert result.execution_time_ms == 1500
