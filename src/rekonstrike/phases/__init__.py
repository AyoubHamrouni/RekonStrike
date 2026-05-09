"""Phase registry — import all phases to register them"""

from ..engine import phase, get_registered_phases, _phase_registry

# Import phases to trigger registration
from . import (
    validation,
    passive_recon,
    active_enum,
    dns_brute,
    http_probing,
    content_discovery,
    js_analysis,
    vuln_scan,
    roi_scoring,
)

__all__ = ["phase", "get_registered_phases"]
