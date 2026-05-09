"""Phase registry — import all phases to register them"""
from ..engine import phase, get_registered_phases, _phase_registry

# Import phases to trigger registration
from . import phase0, phase1, phase2, phase3, phase4, phase5, phase6

__all__ = ["phase", "get_registered_phases"]
