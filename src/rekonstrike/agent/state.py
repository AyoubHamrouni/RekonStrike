from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Dict, Any

class ReconState(BaseModel):
    model_config = ConfigDict(frozen=False)

    # ── Program Context ──
    target_domain: str
    goal: str
    program_scope: Dict[str, List[str]] = Field(default_factory=dict)
    platform_context: Dict[str, Any] = Field(
        default_factory=dict,
        description="Platform metadata: bounty range, recently-added assets, competition, etc.",
    )

    # ── Strategy (set by strategy_node at start; refined at major milestones) ──
    strategy: Dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Strategic plan: {focus_areas, depth_vs_breadth, risk_tolerance, "
            "priority_targets, phases_to_skip, reasoning}"
        ),
    )
    guidance: List[str] = Field(
        default_factory=list,
        description="Human-readable explanations accumulated per step (primary UX output)",
    )

    # ── Execution State ──
    discovered_subdomains: List[str] = Field(default_factory=list)
    live_hosts: List[Dict[str, Any]] = Field(default_factory=list)
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    phase_results: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Detailed per-phase output, keyed by phase name",
    )
    tools_tried: List[str] = Field(default_factory=list)
    phases_tried: List[str] = Field(default_factory=list)

    # ── Agent Loop ──
    next_action: str = ""
    reasoning: str = ""
    interrupt_reason: str = ""

    # ── Metadata ──
    started_at: datetime = Field(default_factory=datetime.now)
    step_count: int = 0
    max_steps: int = 10
    last_tool_result: Dict[str, Any] = Field(default_factory=dict)
