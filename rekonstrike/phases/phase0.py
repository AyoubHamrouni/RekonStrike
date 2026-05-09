"""Phase 0: Scope validation and target initialization"""
import json
from pathlib import Path

from sqlalchemy import select

from . import phase
from ..output import out


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

        out.success("Target validated and pipeline initialized")

    async def _load_scope_file(self, path: Path):
        from ..database import ProgramScope

        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            out.warning(f"Failed to parse scope file: {e}")
            return

        try:
            scopes = data.get("data", {}).get("relationships", {}).get("structured_scopes", {}).get("data", [])
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
        async with await self.ctx.db.get_session() as s:
            async with s.begin():
                existing = await s.execute(
                    select(ProgramScope).where(ProgramScope.target_id == self.ctx.target_id)
                )
                ps = existing.scalar_one_or_none()
                if ps:
                    ps.in_scope = in_scope_rules
                    ps.out_of_scope = out_of_scope_rules
                else:
                    ps = ProgramScope(
                        target_id=self.ctx.target_id,
                        platform=self.ctx.settings.platform or "manual",
                        program_handle=self.ctx.settings.program_handle or self.ctx.target,
                        in_scope=in_scope_rules,
                        out_of_scope=out_of_scope_rules,
                    )
                    s.add(ps)

        out.success(f"Loaded {len(in_scope_rules)} in-scope + {len(out_of_scope_rules)} out-of-scope rules")
