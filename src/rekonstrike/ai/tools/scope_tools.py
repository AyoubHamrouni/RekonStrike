import fnmatch
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def _match_scope(asset: str, patterns: List[str]) -> bool:
    """Check if an asset matches any of the given glob/wildcard patterns."""
    for pattern in patterns:
        pattern = pattern.strip().lower()
        if not pattern:
            continue
        if fnmatch.fnmatch(asset.lower(), pattern):
            return True
        # Also try matching against just the hostname portion
        if "://" in asset:
            host = asset.split("://", 1)[1].split("/")[0]
            if fnmatch.fnmatch(host.lower(), pattern):
                return True
    return False


_HIGH_VALUE_KEYWORDS = [
    "dev", "stg", "stage", "uat", "test", "beta",
    "admin", "corp", "int", "portal", "vpn",
    "api", "graphql", "swagger",
    "v1", "old", "legacy",
]


def _is_high_value(asset: str) -> bool:
    """Determine if an asset looks particularly interesting."""
    lower = asset.lower()
    for kw in _HIGH_VALUE_KEYWORDS:
        if kw in lower:
            return True
    return False


class ScopeAdvisor:
    """Deterministic scope analyzer — compares discovered assets against scope definitions."""

    def analyze_scope(self, in_scope: List[str], out_of_scope: List[str], discovered: List[str]) -> Dict[str, Any]:
        """Analyzes assets against scope rules using pattern matching."""
        results = {
            "in_scope_confirmed": [],
            "out_of_scope_flagged": [],
            "unclear": [],
            "high_value": [],
        }

        for asset in discovered:
            asset = asset.strip()
            if not asset:
                continue

            if _match_scope(asset, out_of_scope):
                results["out_of_scope_flagged"].append(asset)
            elif _match_scope(asset, in_scope):
                results["in_scope_confirmed"].append(asset)
                if _is_high_value(asset):
                    results["high_value"].append(asset)
            else:
                results["unclear"].append(asset)

        return results


async def run_scope_advisor(*args, **kwargs) -> Dict[str, Any]:
    """Entry point — fully deterministic, no LLM call.
    
    Accepts (in_scope, out_of_scope, discovered) or (settings, in_scope, out_of_scope, discovered)
    for backward compatibility with existing callers.
    """
    if len(args) == 3:
        in_scope, out_of_scope, discovered = args
    elif len(args) == 4:
        _, in_scope, out_of_scope, discovered = args
    elif "discovered" in kwargs:
        in_scope = kwargs.get("in_scope", [])
        out_of_scope = kwargs.get("out_of_scope", [])
        discovered = kwargs["discovered"]
    else:
        raise TypeError("run_scope_advisor requires in_scope, out_of_scope, and discovered")
    advisor = ScopeAdvisor()
    return advisor.analyze_scope(in_scope, out_of_scope, discovered)
