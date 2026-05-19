import importlib.util
from pathlib import Path
from types import SimpleNamespace


def _load_addon_module():
    path = Path(__file__).resolve().parents[1] / "proxy-service" / "addon.py"
    spec = importlib.util.spec_from_file_location("proxy_addon", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[assignment]
    return mod


def test_scrub_headers_removes_sensitive_keys():
    mod = _load_addon_module()
    headers = {
        "Authorization": "Bearer x",
        "Cookie": "a=b",
        "X-API-Key": "k",
        "X-Auth-Custom": "v",
        "Content-Type": "application/json",
    }
    scrubbed, count = mod.scrub_headers(headers)
    assert count == 4
    assert "Authorization" not in scrubbed
    assert "Cookie" not in scrubbed
    assert "X-API-Key" not in scrubbed
    assert "X-Auth-Custom" not in scrubbed
    assert scrubbed["Content-Type"] == "application/json"


def test_scope_matcher_domain_and_path_glob():
    mod = _load_addon_module()
    matcher = mod.ScopeMatcher.from_scope_lists(
        in_scope=["*.example.com/api/*", "example.com/login"],
        out_of_scope=["admin.example.com/*"],
    )
    assert matcher.matches("api.example.com", "/api/v1/users")
    assert matcher.matches("example.com", "/login")
    assert not matcher.matches("example.com", "/billing")
    assert not matcher.matches("admin.example.com", "/api/v1/users")


def test_request_body_is_truncated_to_configured_limit():
    mod = _load_addon_module()
    addon = mod.RekonStrikeCaptureAddon()
    addon.started = True
    addon.db = object()
    addon.max_body_bytes = 4
    addon.program_id = 1
    addon.user_id = 1
    addon.ready = True
    addon.matcher = mod.ScopeMatcher.from_scope_lists(["example.com/*"], [])

    class Headers(dict):
        def items(self):
            return super().items()

    req = SimpleNamespace(
        pretty_url="https://example.com/api?q=1",
        method="POST",
        headers=Headers({"Content-Type": "application/json", "Authorization": "Bearer x"}),
        raw_content=b"abcdefgh",
    )
    flow = SimpleNamespace(request=req)
    addon.request(flow)
    payload = addon.queue.get_nowait()
    assert payload["body"] == b"abcd"
    assert payload["body_size"] == 8
    assert payload["query_string"] == "q=1"


def test_json_body_sensitive_fields_are_redacted():
    mod = _load_addon_module()
    raw = b'{"password":"p","api_key":"k","nested":{"token":"t","ok":"v"}}'
    out = mod.scrub_body_json(raw)
    assert out is not None
    text = out.decode("utf-8")
    assert '"password":"[REDACTED]"' in text
    assert '"api_key":"[REDACTED]"' in text
    assert '"token":"[REDACTED]"' in text
    assert '"ok":"v"' in text


def test_metrics_snapshot_contains_expected_counters():
    mod = _load_addon_module()
    addon = mod.RekonStrikeCaptureAddon()
    metrics = addon.metrics_snapshot()
    assert "captured_count" in metrics
    assert "filtered_count" in metrics
    assert "write_errors" in metrics
    assert "scope_cache_hits" in metrics
    assert "scope_cache_misses" in metrics
    assert "dropped_count" in metrics
