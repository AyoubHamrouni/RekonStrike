import asyncio
import fnmatch
import json
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import select

from rekonstrike.database import ProgramScope, RawHTTPCapture, get_database

try:
    from mitmproxy import ctx  # type: ignore
except Exception:  # pragma: no cover - tests run without mitmproxy
    ctx = SimpleNamespace(options=SimpleNamespace(), log=logging.getLogger("proxy-addon"))


SENSITIVE_EXACT = {
    "authorization",
    "authorization-bearer",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-secret",
    "x-csrf-token",
}
SENSITIVE_PREFIX = ("x-auth-",)
SENSITIVE_CONTAINS = ("token", "secret", "key")


@dataclass(slots=True)
class ScopeRule:
    host_pattern: str
    path_pattern: str


class ScopeMatcher:
    def __init__(self, in_scope: list[ScopeRule], out_of_scope: list[ScopeRule]) -> None:
        self.in_scope = in_scope
        self.out_of_scope = out_of_scope

    def matches(self, host: str, path: str) -> bool:
        for rule in self.out_of_scope:
            if self._matches_rule(host, path, rule):
                return False
        for rule in self.in_scope:
            if self._matches_rule(host, path, rule):
                return True
        return False

    @staticmethod
    def _matches_rule(host: str, path: str, rule: ScopeRule) -> bool:
        host_ok = fnmatch.fnmatch(host, rule.host_pattern)
        path_ok = fnmatch.fnmatch(path, rule.path_pattern)
        return host_ok and path_ok

    @classmethod
    def from_scope_lists(cls, in_scope: list[str], out_of_scope: list[str]) -> "ScopeMatcher":
        return cls(
            [cls._compile_rule(v) for v in in_scope if v],
            [cls._compile_rule(v) for v in out_of_scope if v],
        )

    @staticmethod
    def _compile_rule(raw: str) -> ScopeRule:
        value = raw.strip().lower()
        if value.startswith("http://") or value.startswith("https://"):
            parsed = urlsplit(value)
            host = (parsed.hostname or "*").lower()
            path = parsed.path or "/*"
            return ScopeRule(host_pattern=host, path_pattern=_normalize_path_pattern(path))
        if "/" in value:
            host, path = value.split("/", 1)
            host = host or "*"
            return ScopeRule(host_pattern=host.lower(), path_pattern=_normalize_path_pattern("/" + path))
        return ScopeRule(host_pattern=value, path_pattern="/*")


def _normalize_path_pattern(path: str) -> str:
    if not path:
        return "/*"
    if path == "/":
        return "/"
    if path.endswith("*"):
        return path
    return path if path.count("*") else path + "*"


def scrub_headers(headers: dict[str, str]) -> tuple[dict[str, str], int]:
    out: dict[str, str] = {}
    scrubbed = 0
    for key, value in headers.items():
        k = key.lower().strip()
        if _is_sensitive_header(k):
            scrubbed += 1
            continue
        out[key] = value
    return out, scrubbed


def _is_sensitive_header(key: str) -> bool:
    if key in SENSITIVE_EXACT:
        return True
    if any(key.startswith(prefix) for prefix in SENSITIVE_PREFIX):
        return True
    return any(token in key for token in SENSITIVE_CONTAINS)


class RekonStrikeCaptureAddon:
    def __init__(self) -> None:
        self.log = logging.getLogger("rekonstrike.proxy.addon")
        self.db = None
        self.matcher: ScopeMatcher | None = None
        self.scope_loaded_at: datetime | None = None
        self.scope_ttl = timedelta(seconds=300)
        self.max_body_bytes = 10 * 1024 * 1024
        self.program_id = 0
        self.user_id = 0
        self.fail_closed = True
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=5000)
        self.writer_task: asyncio.Task[None] | None = None
        self.refresh_task: asyncio.Task[None] | None = None
        self.started = False
        self.ready = False
        self.captured_count = 0
        self.filtered_count = 0
        self.write_errors = 0
        self.scope_cache_hits = 0
        self.scope_cache_misses = 0
        self.dropped_count = 0
        self.scrubbed_header_total = 0
        self._not_ready_logged = False

    def load(self, loader: Any) -> None:
        loader.add_option("rs_program_id", int, int(os.getenv("RS_PROGRAM_ID", "0")), "Active program id")
        loader.add_option("rs_user_id", int, int(os.getenv("RS_USER_ID", "0")), "Active user id")
        loader.add_option("rs_proxy_max_body_bytes", int, int(os.getenv("RS_PROXY_MAX_BODY_BYTES", str(10 * 1024 * 1024))), "Max captured body bytes")
        loader.add_option("rs_scope_ttl_seconds", int, int(os.getenv("RS_SCOPE_TTL_SECONDS", "300")), "Scope cache TTL")
        loader.add_option("rs_proxy_fail_closed", bool, os.getenv("RS_PROXY_FAIL_CLOSED", "true").lower() == "true", "Fail closed if scope/db unavailable")

    def running(self) -> None:
        loop = asyncio.get_event_loop()
        self.program_id = int(getattr(ctx.options, "rs_program_id", 0))
        self.user_id = int(getattr(ctx.options, "rs_user_id", 0))
        self.max_body_bytes = int(getattr(ctx.options, "rs_proxy_max_body_bytes", 10 * 1024 * 1024))
        self.scope_ttl = timedelta(seconds=int(getattr(ctx.options, "rs_scope_ttl_seconds", 300)))
        self.fail_closed = bool(getattr(ctx.options, "rs_proxy_fail_closed", True))

        if self.program_id <= 0:
            self.log.error("proxy addon disabled: missing rs_program_id")
            return
        if self.user_id <= 0:
            self.log.error("proxy addon disabled: missing rs_user_id")
            return
        self.db = get_database()
        try:
            loop.run_until_complete(self._load_scope())
            self.ready = True
        except RuntimeError:
            # Event loop already running in some embeddings; delay readiness until async load succeeds.
            self.ready = False
        except Exception as exc:
            self.log.error("failed initial scope load; addon disabled: %s", exc)
            return
        self.writer_task = loop.create_task(self._writer_loop())
        self.refresh_task = loop.create_task(self._scope_refresh_loop())
        self.started = True

    async def _load_scope(self) -> None:
        if self.db is None:
            raise RuntimeError("database not initialized")
        async with self.db.get_session() as session:
            row = await session.scalar(
                select(ProgramScope).where(ProgramScope.program_id == self.program_id).order_by(ProgramScope.updated_at.desc())
            )
            if row is None:
                raise RuntimeError(f"scope not found for program_id={self.program_id}")
            self.matcher = ScopeMatcher.from_scope_lists(row.in_scope or [], row.out_of_scope or [])
            self.scope_loaded_at = datetime.now(UTC)

    async def _scope_refresh_loop(self) -> None:
        while True:
            try:
                needs_refresh = self.scope_loaded_at is None or (datetime.now(UTC) - self.scope_loaded_at) >= self.scope_ttl
                if needs_refresh:
                    await self._load_scope()
                    self.ready = True
                    self._not_ready_logged = False
            except Exception as exc:
                self.log.warning("scope refresh failed: %s", exc)
            await asyncio.sleep(5)

    def request(self, flow: Any) -> None:
        if not self.started or self.db is None:
            return
        if not self.ready:
            self.scope_cache_misses += 1
            if self.fail_closed and not self._not_ready_logged:
                self.log.warning("scope not loaded yet; capture is fail-closed until scope is ready")
                self._not_ready_logged = True
            return
        self.scope_cache_hits += 1
        parsed = urlsplit(flow.request.pretty_url)
        host = (parsed.hostname or "").lower()
        path = parsed.path or "/"
        if not host:
            self.filtered_count += 1
            return
        if self.matcher is None:
            if self.fail_closed:
                self.filtered_count += 1
                return
        elif not self.matcher.matches(host, path):
            self.filtered_count += 1
            return

        headers_map = {k: v for k, v in flow.request.headers.items()}
        sanitized_headers, scrubbed_count = scrub_headers(headers_map)
        self.scrubbed_header_total += scrubbed_count
        raw_body = flow.request.raw_content or b""
        body_size = len(raw_body)
        body = raw_body[: self.max_body_bytes] if raw_body else None
        if body:
            body = scrub_body_json(body)
        payload = {
            "id": str(uuid4()),
            "program_id": self.program_id,
            "user_id": self.user_id,
            "method": flow.request.method,
            "url": flow.request.pretty_url,
            "hostname": host,
            "path": path,
            "query_string": parsed.query or None,
            "headers": sanitized_headers,
            "body": body,
            "body_size": body_size,
            "timestamp": datetime.now(UTC),
            "scope_matched": True,
            "captured_at": datetime.now(UTC),
        }
        try:
            self.queue.put_nowait(payload)
            self.captured_count += 1
        except asyncio.QueueFull:
            self.dropped_count += 1
            self.log.warning("capture queue full; dropped_count=%d", self.dropped_count)
        if scrubbed_count:
            self.log.info("scrubbed_headers=%d host=%s path=%s", scrubbed_count, host, path)

    async def _writer_loop(self) -> None:
        while True:
            try:
                batch = [await self.queue.get()]
                deadline = asyncio.get_event_loop().time() + 0.5
                while len(batch) < 50:
                    timeout = deadline - asyncio.get_event_loop().time()
                    if timeout <= 0:
                        break
                    try:
                        batch.append(await asyncio.wait_for(self.queue.get(), timeout=timeout))
                    except TimeoutError:
                        break
                await self._flush_batch(batch)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                self.log.exception("writer loop error: %s", exc)

    async def _flush_batch(self, batch: list[dict[str, Any]]) -> None:
        if self.db is None:
            return
        for attempt in range(3):
            try:
                async with self.db.get_session() as session:
                    session.add_all([RawHTTPCapture(**item) for item in batch])
                    await session.commit()
                return
            except Exception as exc:
                if attempt == 2:
                    self.write_errors += 1
                    self.log.error("failed to write capture batch size=%d: %s", len(batch), exc)
                    return
                await asyncio.sleep(0.2 * (2**attempt))

    def done(self) -> None:
        if self.refresh_task:
            self.refresh_task.cancel()
        if self.writer_task:
            self.writer_task.cancel()

    def metrics_snapshot(self) -> dict[str, int]:
        return {
            "captured_count": self.captured_count,
            "filtered_count": self.filtered_count,
            "write_errors": self.write_errors,
            "scope_cache_hits": self.scope_cache_hits,
            "scope_cache_misses": self.scope_cache_misses,
            "dropped_count": self.dropped_count,
            "scrubbed_header_total": self.scrubbed_header_total,
        }


def scrub_body_json(body: bytes) -> bytes | None:
    if not body:
        return None
    try:
        data = json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return body

    scrubbed = _scrub_json_value(data)
    return json.dumps(scrubbed, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _scrub_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if _is_sensitive_json_key(str(k)):
                out[k] = "[REDACTED]"
            else:
                out[k] = _scrub_json_value(v)
        return out
    if isinstance(value, list):
        return [_scrub_json_value(v) for v in value]
    return value


def _is_sensitive_json_key(key: str) -> bool:
    k = key.lower()
    sensitive = {
        "password",
        "passwd",
        "secret",
        "api_key",
        "apikey",
        "token",
        "credit_card",
        "ssn",
        "auth",
        "authorization",
        "jwt",
        "session",
    }
    if k in sensitive:
        return True
    return any(t in k for t in ("password", "secret", "token", "api_key", "apikey", "auth", "ssn"))


addons = [RekonStrikeCaptureAddon()]
