from pydantic import BaseModel, Field


class AffectedEndpoint(BaseModel):
    method: str
    path: str
    parameters: list[str] = Field(default_factory=list)
    evidence: str = ""


class ThreatFinding(BaseModel):
    finding_type: str
    finding_subtype: str = "potential"  # "confirmed" | "potential"
    risk_rank: str = "medium"  # "critical" | "high" | "medium" | "low" | "info"
    affected_endpoints: list[AffectedEndpoint] = Field(default_factory=list)
    exploitation_description: str = ""
    exploitation_difficulty: str = "medium"  # "easy" | "medium" | "hard"
    data_at_risk: list[str] = Field(default_factory=list)
    affected_roles: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    recommended_test: str = ""
    exploitation_chain: list[str] = Field(default_factory=list)


class PrivilegeEscalationChain(BaseModel):
    from_role: str
    to_role: str
    path: list[str] = Field(default_factory=list)
    finding_indices: list[int] = Field(default_factory=list)


class ThreatAssessment(BaseModel):
    target: str = ""
    analyzed_at: str = ""
    model_used: str = "fast"  # "fast" | "deep"
    risk_summary: dict[str, int] = Field(default_factory=lambda: {
        "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0,
    })
    findings: list[ThreatFinding] = Field(default_factory=list)
    privilege_escalation_chains: list[PrivilegeEscalationChain] = Field(default_factory=list)
    session_recommendations: list[str] = Field(default_factory=list)


def empty_assessment(target: str = "", model: str = "haiku") -> ThreatAssessment:
    import datetime
    return ThreatAssessment(
        target=target,
        analyzed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        model_used=model,
        session_recommendations=["No web surface captured. Run the proxy or import Burp/Caido data to generate a threat model."],
    )


def compute_risk_summary(findings: list[ThreatFinding]) -> dict[str, int]:
    summary: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        rank = f.risk_rank if f.risk_rank in summary else "info"
        summary[rank] = summary.get(rank, 0) + 1
    return summary
