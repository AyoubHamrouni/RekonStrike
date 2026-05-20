import datetime
import json
import logging
from typing import Any

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate

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

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_HAIKU = """You are an offensive security analyst reviewing a captured web application surface. Your task is to identify realistic exploitation chains based on the captured endpoints, authentication patterns, and pre-detected anomalies.

CONTEXT:
- You have a valid user account on this application (authenticated perspective)
- Review the full surface: endpoints, parameters, auth mechanisms, anomalies
- Chain findings: identify how one vulnerability enables another

PRIORITY (by severity):
- critical: Remote code execution, authentication bypass, privilege escalation from user to admin
- high: Insecure direct object reference, mass assignment, server-side request forgery
- medium: Information disclosure, CSRF, conditional schema leakage, shared ID parameters
- low: Enumeration, dead parameters, missing headers

OUTPUT RULES:
- Return ONLY valid JSON matching the schema below. No prose, no markdown.
- Every finding MUST reference an actual endpoint from the provided input. Never invent endpoints.
- Finding types: idor, mass_assignment, privilege_escalation, auth_bypass, ssrf, information_disclosure, csrf, session_fixation, inconsistent_auth, token_leakage, sequence_bypass, conditional_schema_leakage, enumeration, logic_flaw, rce
- Prefix with "potential_" when only structural evidence exists without an anomaly trigger
- Prioritize IMPACT over ease of exploitation
- Max 10 findings. If more exist, include only the highest-risk ones.
- Never output credentials, secrets, or API keys.
- never include markdown code fences in your output

JSON SCHEMA:
{
  "findings": [
    {
      "finding_type": "idor",
      "finding_subtype": "confirmed",
      "risk_rank": "high",
      "affected_endpoints": [{"method": "GET", "path": "/api/users/{id}", "parameters": ["id"], "evidence": "Integer ID parameter with low entropy"}],
      "exploitation_description": "Brief description of how an attacker would exploit this",
      "exploitation_difficulty": "easy",
      "data_at_risk": ["user_profiles", "personal_data"],
      "affected_roles": ["user"],
      "confidence": 0.9,
      "recommended_test": "Specific payload or technique to confirm",
      "exploitation_chain": []
    }
  ],
  "privilege_escalation_chains": [
    {
      "from_role": "user",
      "to_role": "admin",
      "path": ["GET /api/users/{id}", "GET /api/admin/users/{id}"],
      "finding_indices": [0]
    }
  ],
  "session_recommendations": ["Brief actionable recommendation"]
}"""

SYSTEM_PROMPT_OPUS = """You are a senior offensive security analyst performing deep threat modeling on a captured web application surface. Your task is to produce a comprehensive, high-quality threat assessment with exploitation chains.

CONTEXT:
- You have a valid user account on this application (authenticated perspective)
- Analyze the full surface with attention to subtle inter-endpoint relationships
- Every finding should identify a specific exploitation path, not a generic vulnerability class

PRIORITY (by severity):
- critical: Remote code execution, authentication bypass, privilege escalation user-to-admin
- high: IDOR, mass assignment, SSRF, privilege escalation
- medium: Information disclosure, CSRF, conditional schema, shared ID parameters, sequence bypass
- low: Enumeration, dead parameters

OUTPUT RULES:
- Return ONLY valid JSON. No prose, no markdown, no code fences.
- Every finding MUST reference actual endpoints from the input. Never invent.
- Finding types: idor, mass_assignment, privilege_escalation, auth_bypass, ssrf, information_disclosure, csrf, session_fixation, inconsistent_auth, token_leakage, sequence_bypass, conditional_schema_leakage, enumeration, logic_flaw, rce
- Use "confirmed" subtype when anomaly evidence supports the finding, "potential" when structural only
- Include exploitation chains connecting findings where applicable
- Never output credentials, secrets, or API keys
- No markdown code fences in output; output raw JSON only

JSON SCHEMA:
{
  "findings": [
    {
      "finding_type": "idor",
      "finding_subtype": "confirmed",
      "risk_rank": "high",
      "affected_endpoints": [{"method": "GET", "path": "/api/users/{id}", "parameters": ["id"], "evidence": "Integer ID with low entropy, appears in response"}],
      "exploitation_description": "Step-by-step description of the exploitation path with specific technical detail",
      "exploitation_difficulty": "easy",
      "data_at_risk": ["user_profiles", "email_addresses", "internal_notes"],
      "affected_roles": ["user"],
      "confidence": 0.92,
      "recommended_test": "Send GET /api/users/1 and GET /api/users/2 with same session, compare response bodies for field differences",
      "exploitation_chain": ["Requires valid user session"]
    }
  ],
  "privilege_escalation_chains": [
    {
      "from_role": "user",
      "to_role": "admin",
      "path": ["GET /api/users/{id}", "POST /api/auth/upgrade"],
      "finding_indices": [0, 1]
    }
  ],
  "session_recommendations": ["Rotate JWT on role change", "Add CSRF tokens to state-changing endpoints"]
}"""


def _build_prompt(tier: str, user_answers: list[dict[str, str]] | None = None) -> ChatPromptTemplate:
    from langchain_core.messages import SystemMessage, HumanMessage
    from langchain_core.prompts import ChatPromptTemplate

    system = SystemMessage(content=SYSTEM_PROMPT_OPUS if tier == "opus" else SYSTEM_PROMPT_HAIKU)

    user_parts = []
    if user_answers:
        answers_text = "\n".join(
            f"Q: {a.get('question', '')}\nA: {a.get('answer', '')}"
            for a in user_answers
        )
        user_parts.append(f"USER CONTEXT:\nThe user provided the following answers about the application:\n{answers_text}\n\n")
    user_parts.append("{surface_json}")

    user = HumanMessage(content="\n".join(user_parts))

    return ChatPromptTemplate.from_messages([system, user])


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
    tier: str = "haiku",
    llm: Any = None,
) -> ThreatAssessment:
    if not surface.request_count and not surface.resource_families:
        return empty_assessment(target=surface.target, model=tier)

    if llm is None:
        model_name = "claude-3-haiku-20240307" if tier == "haiku" else "claude-3-opus-20240229"
        llm = get_llm(settings, temperature=0.0, model=model_name)

    prompt = _build_prompt(tier, user_answers)
    is_mock = not type(llm).__module__.startswith('langchain')

    surface_json = surface.model_dump_json(indent=2)

    async def _call_llm() -> dict:
        if is_mock:
            response = await llm.ainvoke(surface_json)
            raw_content = response.content if hasattr(response, 'content') else str(response)
            return json.loads(raw_content)
        else:
            parser = JsonOutputParser()
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
