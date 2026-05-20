import logging

logger = logging.getLogger(__name__)

async def mock_async_func(*args, **kwargs):
    logger.warning("AI features disabled: dependencies missing.")
    return {}

try:
    from .agents.surface_agent import analyze_surface
    from .agents.triage_agent import run_triage
    from .agents.advisor_agent import get_test_suggestions
    from .agents.report_agent import run_report_drafter
    from .agents.threat_model_agent import run_threat_model
    from .tools.scope_tools import run_scope_advisor
except ImportError:
    logger.error("Could not import AI agents. Mocking AI layer.")
    analyze_surface = mock_async_func
    run_triage = mock_async_func
    get_test_suggestions = mock_async_func
    run_report_drafter = mock_async_func
    run_threat_model = mock_async_func
    run_scope_advisor = mock_async_func

__all__ = ["analyze_surface", "run_triage", "get_test_suggestions", "run_report_drafter", "run_scope_advisor", "run_threat_model"]
