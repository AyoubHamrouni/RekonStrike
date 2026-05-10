# Implementation Plan

## Architecture
- Strategist (LLM, runs once) + Triager (LLM, runs after each phase)
- Guidance stored in state.guidance (batch), streamed via SSE (API layer)
- All new state fields default to empty for backward compat

## Steps

### Done
1. State: strategy, guidance, phase_results, platform_context — `state.py`
2. Graph: strategy_node + triage_node split — `graph.py`
3. Phases: structured results, strategy-aware — `phases.py`
4. LLM prompts: strategy + triage prompts with guidance output — `graph.py`
5. Runner: PlatformManager wired, platform/program_handle params — `runner.py`
6. Tests: strategy, triage, guidance, platform context tests — `test_graph.py`, `test_end_to_end.py`
7. Lint + verify: ruff clean, 61 tests pass

### Doing Now
8. API: Replace /agent/run with session-based SSE streaming:
    - POST /targets/{id}/agent/start → create session, return session_id
    - GET /targets/{id}/agent/{session_id}/stream → SSE of guidance + state
    - POST /targets/{id}/agent/{session_id}/feedback → user interrupt/redirect
    - GET /targets/{id}/agent/{session_id}/state → current state snapshot
    - Files: `api/routers/agent.py`, `agent/runner.py`
