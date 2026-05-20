"""Testing workspace API — session management and test result submission."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import verify_auth, get_target_repo, get_db_session
from ...repositories.target_repo import TargetRepository
from ...database import TestingSession, TestResult, AIInsight
from ...config import load_settings
try:
    from ...ai.factory import get_llm
except ImportError:
    class NoopLLM:
        async def ainvoke(self, messages):
            class Response:
                content = '{"exploitation_steps": [], "tools_recommended": []}'
            return Response()

    def get_llm(settings, temperature=0.0, **kwargs):
        return NoopLLM()
try:
    from ...ai.prompts.testing_advice import prompt as advice_prompt
except ImportError:
    advice_prompt = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/targets/{target_id}/testing", tags=["testing"])

RISK_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


# ─── Request/Response schemas ───────────────────────────────────────────


class StartSessionRequest(BaseModel):
    threat_model_id: int | None = None


class SubmitResultRequest(BaseModel):
    finding_id: int
    endpoint: str = Field(..., min_length=1, max_length=1024)
    payload: str = Field(default="", max_length=50000)
    response_status: int = Field(default=0, ge=0, le=599)
    response_body: str | None = Field(default=None, max_length=10240)
    confirmed: bool = False
    notes: str | None = Field(default=None, max_length=10000)


class UpdateSessionRequest(BaseModel):
    status: str = Field(..., pattern="^(paused|completed)$")


# ─── Helpers ────────────────────────────────────────────────────────────


async def _load_threat_model(session: AsyncSession, target_id: int, threat_model_id: int | None):
    if threat_model_id:
        stmt = select(AIInsight).where(
            AIInsight.id == threat_model_id,
            AIInsight.target_id == target_id,
            AIInsight.insight_type == "threat_model",
        )
        result = await session.execute(stmt)
        insight = result.scalar_one_or_none()
        if not insight:
            raise HTTPException(status_code=404, detail="Threat model not found")
    else:
        stmt = select(AIInsight).where(
            AIInsight.target_id == target_id,
            AIInsight.insight_type == "threat_model",
        ).order_by(AIInsight.created_at.desc()).limit(1)
        result = await session.execute(stmt)
        insight = result.scalar_one_or_none()
        if not insight:
            raise HTTPException(status_code=404, detail="No threat model found for this target. Run threat model analysis first.")

    return insight


def _sort_findings(findings: list[dict]) -> list[dict]:
    return sorted(findings, key=lambda f: RISK_ORDER.get(f.get("risk_rank", "info"), 4))


# ─── Endpoints ──────────────────────────────────────────────────────────


@router.post("/session")
async def start_session(
    target_id: int,
    body: StartSessionRequest,
    auth: bool = Depends(verify_auth),
    repo: TargetRepository = Depends(get_target_repo),
    db_session: AsyncSession = Depends(get_db_session),
):
    target = await repo.get(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    insight = await _load_threat_model(db_session, target_id, body.threat_model_id)
    assessment = insight.result if isinstance(insight.result, dict) else __import__("json").loads(insight.result)
    findings = _sort_findings(assessment.get("findings", []))

    testing_session = TestingSession(
        target_id=target_id,
        threat_model_id=insight.id,
        status="active",
    )
    db_session.add(testing_session)
    await db_session.commit()
    await db_session.refresh(testing_session)

    return {
        "session_id": testing_session.id,
        "threat_model": assessment,
        "findings": findings,
        "status": testing_session.status,
        "started_at": testing_session.started_at.isoformat(),
    }


@router.get("/session")
async def get_session(
    target_id: int,
    page: int = Query(0, ge=0, description="Page number for findings"),
    size: int = Query(50, ge=1, le=200, description="Findings per page"),
    auth: bool = Depends(verify_auth),
    db_session: AsyncSession = Depends(get_db_session),
    repo: TargetRepository = Depends(get_target_repo),
):
    target = await repo.get(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    stmt = select(TestingSession).where(
        TestingSession.target_id == target_id,
    ).order_by(TestingSession.created_at.desc()).limit(1)
    result = await db_session.execute(stmt)
    testing_session = result.scalar_one_or_none()
    if not testing_session:
        return {"session_id": None, "findings_tested": 0, "findings_confirmed": 0, "findings": [], "status": None}

    findings: list[dict] = []
    if testing_session.threat_model_id:
        insight_stmt = select(AIInsight).where(AIInsight.id == testing_session.threat_model_id)
        insight_result = await db_session.execute(insight_stmt)
        insight = insight_result.scalar_one_or_none()
        if insight:
            assessment = insight.result if isinstance(insight.result, dict) else __import__("json").loads(insight.result)
            findings = _sort_findings(assessment.get("findings", []))

    # Annotate findings with test results
    result_stmt = select(TestResult).where(
        TestResult.testing_session_id == testing_session.id
    )
    test_results = (await db_session.execute(result_stmt)).scalars().all()
    tested_finding_ids = {r.finding_id for r in test_results}
    confirmed_finding_ids = {r.finding_id for r in test_results if r.confirmed}

    annotated = []
    for i, f in enumerate(findings):
        status = "untested"
        if i in tested_finding_ids:
            status = "tested"
        if i in confirmed_finding_ids:
            status = "confirmed"
        annotated.append({**f, "index": i, "status": status})

    total_findings = len(annotated)
    start = page * size
    paginated = annotated[start:start + size]

    return {
        "session_id": testing_session.id,
        "threat_model_id": testing_session.threat_model_id,
        "findings_tested": len(tested_finding_ids),
        "findings_confirmed": len(confirmed_finding_ids),
        "findings": paginated,
        "total_findings": total_findings,
        "page": page,
        "size": size,
        "status": testing_session.status,
        "started_at": testing_session.started_at.isoformat() if testing_session.started_at else None,
        "completed_at": testing_session.completed_at.isoformat() if testing_session.completed_at else None,
    }


@router.post("/result")
async def submit_result(
    target_id: int,
    body: SubmitResultRequest,
    auth: bool = Depends(verify_auth),
    db_session: AsyncSession = Depends(get_db_session),
    repo: TargetRepository = Depends(get_target_repo),
):
    target = await repo.get(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    stmt = select(TestingSession).where(
        TestingSession.target_id == target_id,
    ).order_by(TestingSession.created_at.desc()).limit(1).with_for_update()
    result = await db_session.execute(stmt)
    testing_session = result.scalar_one_or_none()
    if not testing_session:
        raise HTTPException(status_code=404, detail="No active testing session. Start a session first.")

    if testing_session.status != "active":
        raise HTTPException(status_code=400, detail=f"Session is {testing_session.status}. Resume or start a new session.")

    response_body = body.response_body
    if response_body and len(response_body) > 5120:
        response_body = response_body[:5120]

    test_result = TestResult(
        testing_session_id=testing_session.id,
        finding_id=body.finding_id,
        endpoint=body.endpoint,
        payload=body.payload,
        response_status=body.response_status,
        response_body=response_body,
        confirmed=body.confirmed,
        notes=body.notes,
    )
    db_session.add(test_result)

    # Update session counts
    tested_count = await db_session.scalar(
        select(func.count(TestResult.id)).where(
            TestResult.testing_session_id == testing_session.id
        )
    )
    confirmed_count = await db_session.scalar(
        select(func.count(TestResult.id)).where(
            TestResult.testing_session_id == testing_session.id,
            TestResult.confirmed.is_(True),
        )
    )
    testing_session.findings_tested = tested_count or 0
    testing_session.findings_confirmed = confirmed_count or 0

    await db_session.commit()
    await db_session.refresh(test_result)

    finding_status = "confirmed" if body.confirmed else "dismissed"

    return {
        "result_id": test_result.id,
        "finding_id": body.finding_id,
        "finding_status": finding_status,
        "findings_tested": testing_session.findings_tested,
        "findings_confirmed": testing_session.findings_confirmed,
    }


@router.patch("/session")
async def update_session(
    target_id: int,
    body: UpdateSessionRequest,
    auth: bool = Depends(verify_auth),
    db_session: AsyncSession = Depends(get_db_session),
    repo: TargetRepository = Depends(get_target_repo),
):
    target = await repo.get(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    stmt = select(TestingSession).where(
        TestingSession.target_id == target_id,
    ).order_by(TestingSession.created_at.desc()).limit(1).with_for_update()
    result = await db_session.execute(stmt)
    testing_session = result.scalar_one_or_none()
    if not testing_session:
        raise HTTPException(status_code=404, detail="No active testing session")

    testing_session.status = body.status
    if body.status == "completed":
        testing_session.completed_at = datetime.now(timezone.utc)

    await db_session.commit()
    return {
        "session_id": testing_session.id,
        "status": testing_session.status,
    }


@router.get("/advice/{finding_id}")
async def get_advice(
    target_id: int,
    finding_id: int,
    auth: bool = Depends(verify_auth),
    db_session: AsyncSession = Depends(get_db_session),
):
    stmt = select(AIInsight).where(
        AIInsight.target_id == target_id,
        AIInsight.insight_type == "threat_model",
    ).order_by(AIInsight.created_at.desc()).limit(1)
    result = await db_session.execute(stmt)
    insight = result.scalar_one_or_none()
    if not insight:
        raise HTTPException(status_code=404, detail="No threat model found")

    assessment = insight.result if isinstance(insight.result, dict) else __import__("json").loads(insight.result)
    findings = assessment.get("findings", [])
    if finding_id < 0 or finding_id >= len(findings):
        raise HTTPException(status_code=404, detail=f"Finding index {finding_id} out of range")

    finding = findings[finding_id]
    settings = load_settings()

    try:
        llm = get_llm(settings, temperature=0.1)
        if advice_prompt is not None:
            from langchain_core.output_parsers import JsonOutputParser
            chain = advice_prompt | llm | JsonOutputParser()
            advice = await chain.ainvoke({
                "finding_type": finding.get("finding_type", "unknown"),
                "risk_rank": finding.get("risk_rank", "medium"),
                "description": finding.get("exploitation_description", ""),
                "endpoints": ", ".join(
                    f"{e.get('method', '?')} {e.get('path', '?')}"
                    for e in finding.get("affected_endpoints", [])
                ) or "N/A",
                "data_at_risk": ", ".join(finding.get("data_at_risk", [])) or "N/A",
            })
        else:
            advice = {"exploitation_steps": [], "tools_recommended": []}
        return {
            "finding_id": finding_id,
            **advice,
        }
    except Exception as e:
        logger.error(f"Advice LLM call failed: {e}")
        return {
            "finding_id": finding_id,
            "exploitation_steps": [
                {"step": 1, "action": "Review the finding description and craft a targeted test payload", "tool": "", "payload": ""},
                {"step": 2, "action": "Send the request to the affected endpoint and observe the response", "tool": "curl", "payload": ""},
                {"step": 3, "action": "If vulnerable, document the proof of concept", "tool": "", "payload": ""},
            ],
            "tools_recommended": ["curl", "Burp Suite"],
        }
