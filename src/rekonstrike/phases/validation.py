"""Phase 0: Scope validation, target initialization, and browser capture"""

import json
from pathlib import Path

from sqlalchemy import select

from . import phase
from ..output import out
from ..integrations.browser_client import BrowserClient, BrowserCaptureRequest


@phase(0, "Scope Validation", "Validate target, load scope rules, prepare environment")
class Phase:
    def __init__(self, ctx):
        self.ctx = ctx

    async def run(self):
        target = self.ctx.target
        scope = self.ctx.scope

        out.info(f"Validating target: [bold]{target}[/bold]")
        out.stat("Type", self.ctx.target_type)

        if self.ctx.target_type == "company":
            out.stat("Organization", target)
        elif self.ctx.target_type in ("wildcard", "domain"):
            base = target.lstrip("*.")
            out.stat("Root Domain", base)
            out.stat("In-scope pattern", f"*.{base}")

        # ── Load scope file if configured ────────────────────────────────
        scope_file = self.ctx.settings.scope_file
        if scope_file:
            path = Path(scope_file)
            if path.exists():
                await self._load_scope_file(path)
            else:
                out.warning(f"Scope file not found: {scope_file}")

        out.stat("In-scope rules", str(len(scope.in_scope)))
        out.stat("Out-of-scope rules", str(len(scope.out_of_scope)))

        # ── Browser capture if service is configured ─────────────────────
        browser_url = self.ctx.settings.browser_service_url
        if browser_url:
            await self._run_browser_capture(browser_url)
        else:
            out.info("No browser-service configured — skipping browser capture")

        out.success("Target validated and pipeline initialized")

    async def _run_browser_capture(self, browser_url: str):
        out.info("Starting browser capture...")
        token = self.ctx.settings.browser_service_token or ""
        client = BrowserClient(browser_url, token=token)

        target_url = self.ctx.target
        if self.ctx.target_type in ("wildcard", "domain"):
            target_url = f"https://{self.ctx.target.lstrip('*.')}"

        scope_rules = list(self.ctx.scope.in_scope)
        req = BrowserCaptureRequest(
            target_url=target_url,
            scope=scope_rules or None,
            capture_screenshot=False,
        )

        try:
            result = await client.capture(req)
            out.stat("Browser capture", f"{result.execution_time_ms}ms")
            out.stat("Network requests", str(len(result.network_logs)))
            out.stat("JS bundles", str(len(result.js_bundles)))
            out.stat("Source maps", str(len(result.source_maps)))
            out.stat("Cookies", str(len(result.cookies_set)))
            out.stat("JS errors", str(len(result.javascript_errors)))

            # Persist to database
            await self._save_browser_capture(result)

        except Exception as e:
            out.warning(f"Browser capture failed: {e}")
        finally:
            await client.close()

    async def _save_browser_capture(self, result):
        from ..database import BrowserCapture

        capture = BrowserCapture(
            target_id=self.ctx.target_id,
            scan_session_id=self.ctx.session_id,
            url=result.target_url,
            rendered_html=result.rendered_html,
            network_logs=result.network_logs,
            cookies_set=result.cookies_set,
            local_storage=result.local_storage,
            session_storage=result.session_storage,
            javascript_errors=result.javascript_errors,
            execution_time_ms=result.execution_time_ms,
            screenshot_base64=result.screenshot_base64,
            js_bundles=result.js_bundles,
            source_maps=result.source_maps,
            note=result.note,
        )
        self.ctx.db_session.add(capture)
        await self.ctx.db_session.flush()

    async def _load_scope_file(self, path: Path):
        from ..database import Program, ProgramScope

        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            out.warning(f"Failed to parse scope file: {e}")
            return

        try:
            scopes = (
                data.get("data", {})
                .get("relationships", {})
                .get("structured_scopes", {})
                .get("data", [])
            )
        except AttributeError:
            out.warning("Unexpected scope file format")
            return

        in_scope_rules: list[str] = []
        out_of_scope_rules: list[str] = []

        for item in scopes:
            attrs = item.get("attributes", {})
            asset_id = (attrs.get("asset_identifier") or "").strip()
            instruction = (attrs.get("instruction") or "").lower()
            if not asset_id:
                continue
            if instruction == "out_of_scope":
                out_of_scope_rules.append(asset_id)
            else:
                in_scope_rules.append(asset_id)

        # Update the scope object
        if in_scope_rules:
            self.ctx.scope.in_scope = in_scope_rules
        if out_of_scope_rules:
            self.ctx.scope.out_of_scope = out_of_scope_rules

        # Persist to ProgramScope table
        async with self.ctx.db_session.begin():
            program = await self.ctx.db_session.scalar(
                select(Program).where(
                    Program.scope_target_id == self.ctx.target_id,
                    Program.platform == (self.ctx.settings.platform or "manual"),
                    Program.program_handle == (
                        self.ctx.settings.program_handle or self.ctx.target
                    ),
                )
            )
            if program is None:
                program = Program(
                    scope_target_id=self.ctx.target_id,
                    platform=self.ctx.settings.platform or "manual",
                    program_handle=self.ctx.settings.program_handle or self.ctx.target,
                    program_name=self.ctx.settings.program_handle or self.ctx.target,
                )
                self.ctx.db_session.add(program)
                await self.ctx.db_session.flush()
            existing = await self.ctx.db_session.execute(
                select(ProgramScope).where(ProgramScope.program_id == program.id)
            )
            ps = existing.scalar_one_or_none()
            if ps:
                ps.in_scope = in_scope_rules
                ps.out_of_scope = out_of_scope_rules
            else:
                ps = ProgramScope(
                    program_id=program.id,
                    in_scope=in_scope_rules,
                    out_of_scope=out_of_scope_rules,
                )
                self.ctx.db_session.add(ps)

        out.success(
            f"Loaded {len(in_scope_rules)} in-scope + {len(out_of_scope_rules)} out-of-scope rules"
        )
