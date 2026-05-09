"""Phase 0: Scope validation and target initialization"""
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

        out.stat("In-scope rules", str(len(scope.in_scope)))
        out.stat("Out-of-scope rules", str(len(scope.out_of_scope)))

        out.success("Target validated and pipeline initialized")
