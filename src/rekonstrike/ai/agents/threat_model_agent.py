import datetime
import json
import logging
from typing import Any

from langchain_core.output_parsers import JsonOutputParser

from ..factory import get_llm
from ..schemas.threat_model_input import SurfaceCaptureInput
from ..schemas.threat_model_output import (
    ThreatAssessment,
    ThreatFinding,
    AffectedEndpoint,
    PrivilegeEscalationChain,
    compute_risk_summary,
    empty_assessment,
)
from ..prompts.threat_model import get_prompt_with_context

logger = logging.getLogger(__name__)


def _parse_findings(raw: dict[str, Any]) -> list[ThreatFinding]:
    findings = []
    for item in raw.get("findings", []):
        try:
            affected = [
                AffectedEndpoint(**ep) for ep in item.get("affected_endpoints", [])
            ]
            findings.append(ThreatFinding(
                finding_type=item.get("finding_type", "unknown"),
                finding_subtype=item.get("finding_subtype", "potential"),
                risk_rank=item.get("risk_rank", "medium"),
                affected_endpoints=affected,
                exploitation_description=item.get("exploitation_description", ""),
                exploitation_difficulty=item.get("exploitation_difficulty", "medium"),
                data_at_risk=item.get("data_at_risk", []),
                affected_roles=item.get("affected_roles", []),
                confidence=min(1.0, max(0.0, float(item.get("confidence", 0.5)))),
                recommended_test=item.get("recommended_test", ""),
                exploitation_chain=item.get("exploitation_chain", []),
            ))
        except Exception as e:
            logger.warning(f"Failed to parse finding: {e}")
    return findings


def _parse_chains(raw: dict[str, Any]) -> list[PrivilegeEscalationChain]:
    chains = []
    for item in raw.get("privilege_escalation_chains", []):
        try:
            chains.append(PrivilegeEscalationChain(
                from_role=item.get("from_role", ""),
                to_role=item.get("to_role", ""),
                path=item.get("path", []),
                finding_indices=item.get("finding_indices", []),
            ))
        except Exception as e:
            logger.warning(f"Failed to parse privilege chain: {e}")
    return chains


def _validate_against_surface(
    assessment: ThreatAssessment,
    surface: SurfaceCaptureInput,
) -> ThreatAssessment:
    valid_endpoints: set[str] = set()
    for family in surface.resource_families:
        for ep in family.endpoints:
            valid_endpoints.add(ep.normalized_path)

    validated = []
    for finding in assessment.findings:
        all_exist = True
        for ae in finding.affected_endpoints:
            key = f"{ae.method} {ae.path}"
            if key not in valid_endpoints:
                logger.warning(
                    f"Hallucinated endpoint {key} in finding {finding.finding_type}"
                )
                all_exist = False
                break
        if all_exist:
            validated.append(finding)

    return assessment.model_copy(update={
        "findings": validated,
        "risk_summary": compute_risk_summary(validated),
    })


async def run_threat_model(
    settings: Any,
    surface: SurfaceCaptureInput,
    user_answers: list[dict[str, str]] | None = None,
    tier: str = "fast",
    llm: Any = None,
) -> ThreatAssessment:
    if not surface.request_count and not surface.resource_families:
        return empty_assessment(target=surface.target, model=tier)

    max_output_tokens = 4096 if tier == "fast" else 8192
    if llm is None:
        llm = get_llm(settings, temperature=0.0, tier=tier, max_tokens=max_output_tokens)

    is_mock = not type(llm).__module__.startswith('langchain')

    surface_json = surface.model_dump_json(indent=2)

    max_input_chars = 100_000 if tier == "fast" else 200_000
    if len(surface_json) > max_input_chars:
        logger.warning(
            "Surface input too large (%d chars, max %d), truncating families",
            len(surface_json), max_input_chars,
        )
        original_families = surface.resource_families
        surface.resource_families = sorted(
            original_families, key=lambda f: len(f.endpoints), reverse=True
        )[:5]
        for family in surface.resource_families:
            family.endpoints = family.endpoints[:8]
        surface_json = surface.model_dump_json(indent=2)
        logger.info("Truncated surface to %d chars", len(surface_json))

    async def _call_llm() -> dict:
        if is_mock:
            response = await llm.ainvoke(surface_json)
            raw_content = response.content if hasattr(response, 'content') else str(response)
            return json.loads(raw_content)
        else:
            parser = JsonOutputParser()
            prompt = get_prompt_with_context(tier, user_answers)
            chain = prompt | llm | parser
            return await chain.ainvoke({"surface_json": surface_json})

    try:
        raw = await _call_llm()
    except Exception as e:
        logger.error(f"Threat model LLM call failed (tier={tier}): {e}")
        try:
            raw = await _call_llm()
        except Exception as e2:
            logger.error(f"Threat model retry also failed: {e2}")
            return empty_assessment(target=surface.target, model=tier)

    findings = _parse_findings(raw)
    chains = _parse_chains(raw)
    recommendations = raw.get("session_recommendations", [])

    assessment = ThreatAssessment(
        target=surface.target,
        analyzed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        model_used=tier,
        risk_summary=compute_risk_summary(findings),
        findings=findings,
        privilege_escalation_chains=chains,
        session_recommendations=recommendations,
    )

    assessment = _validate_against_surface(assessment, surface)
    return assessment
