"""Phase registry — import phases via importlib to avoid circular dependencies."""
from ..engine import phase, get_registered_phases, _phase_registry

_PHASE_MODULES = [
    "validation",
    "passive_recon",
    "active_enum",
    "dns_brute",
    "http_probing",
    "content_discovery",
    "js_analysis",
    "vuln_scan",
    "roi_scoring",
    "intelligence",
]


def _register_all():
    """Import all phase modules to trigger their @phase decorators."""
    import importlib
    import sys

    pkg = __package__ or __name__.rpartition(".")[0]
    for mod_name in _PHASE_MODULES:
        full_name = f"{pkg}.{mod_name}"
        if full_name not in sys.modules:
            importlib.import_module(full_name)


# Register all phases eagerly at import time, but via importlib
# to reduce circular import risk vs a bare `from . import ...` statement.
_register_all()

__all__ = [
    "phase",
    "get_registered_phases",
    "_phase_registry",
    *_PHASE_MODULES,
]
