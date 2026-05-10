from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Dict, Any

class ReconState(BaseModel):
    # Immutable context
    target_domain: str
    goal: str
    program_scope: Dict[str, List[str]] = Field(default_factory=dict)
    
    # Mutable state
    discovered_subdomains: List[str] = Field(default_factory=list)
    live_hosts: List[Dict[str, Any]] = Field(default_factory=list)
    tools_tried: List[str] = Field(default_factory=list)
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Agent reasoning
    next_action: str = ""
    reasoning: str = ""
    interrupt_reason: str = ""
    
    # Metadata
    started_at: datetime = Field(default_factory=datetime.now)
    step_count: int = 0
    last_tool_result: Dict[str, Any] = Field(default_factory=dict)
