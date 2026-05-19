import importlib.util
import json
import time
from pathlib import Path
from types import SimpleNamespace


def _load_addon_module():
    path = Path(__file__).resolve().parents[1] / "proxy-service" / "addon.py"
    spec = importlib.util.spec_from_file_location("proxy_addon", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[assignment]
    return mod


def _make_addon(mod):
    addon = mod.RekonStrikeCaptureAddon()
    addon.started = True
    addon.ready = True
    addon.db = object()
    addon.program_id = 1
    addon.user_id = 1
    addon.max_body_bytes = 10 * 1024 * 1024
    addon.matcher = mod.ScopeMatcher.from_scope_lists(
        in_scope=["*.example.com/*", "example.com/api/*"],
        out_of_scope=["malicious.com/*"],
    )
    return addon


def _flow(url: str, method: str, headers: dict[str, str], body: bytes):
    class Headers(dict):
        def items(self):
            return super().items()

    req = SimpleNamespace(
        pretty_url=url,
        method=method,
        headers=Headers(headers),
        raw_content=body,
    )
    return SimpleNamespace(request=req)


def test_request_pipeline_scope_and_scrubbing():
    mod = _load_addon_module()
    addon = _make_addon(mod)

    # 1) in-scope GET should capture
    addon.request(_flow(
        url="https://example.com/api/users",
        method="GET",
        headers={"User-Agent": "pytest"},
        body=b"",
    ))

    # 2) out-of-scope POST should skip
    addon.request(_flow(
        url="https://malicious.com/steal",
        method="POST",
        headers={"Content-Type": "application/json"},
        body=b'{"x":"y"}',
    ))

    # 3) in-scope POST with sensitive header/body should scrub
    addon.request(_flow(
        url="https://api.example.com/api/login",
        method="POST",
        headers={"Authorization": "Bearer secret", "Content-Type": "application/json"},
        body=b'{"password":"secret","ok":"yes"}',
    ))

    assert addon.captured_count == 2
    assert addon.filtered_count == 1

    first = addon.queue.get_nowait()
    second = addon.queue.get_nowait()

    assert first["url"] == "https://example.com/api/users"
    assert first["method"] == "GET"
    assert first["scope_matched"] is True

    assert second["url"] == "https://api.example.com/api/login"
    assert "Authorization" not in second["headers"]
    body = json.loads(second["body"].decode("utf-8"))
    assert body["password"] == "[REDACTED]"
    assert body["ok"] == "yes"


def test_queue_non_blocking_under_load():
    mod = _load_addon_module()
    addon = _make_addon(mod)

    start = time.monotonic()
    for i in range(100):
        addon.request(_flow(
            url=f"https://app.example.com/api/{i}",
            method="GET",
            headers={"User-Agent": "pytest"},
            body=b"",
        ))
    elapsed = time.monotonic() - start

    assert elapsed < 1.0
    assert addon.dropped_count == 0
    assert addon.captured_count == 100
    assert addon.queue.qsize() == 100
