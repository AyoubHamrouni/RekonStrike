"""Program analysis API — analyze and rank bug bounty programs."""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import verify_auth, get_current_user, get_db_session
from ...config import load_settings
from ...database import ProgramAnalysis
from ...integrations.program_client import ProgramClient

try:
    from ...ai.factory import get_llm
except ImportError:
    class NoopLLM:
        async def ainvoke(self, messages):
            class Response:
                content = '{"risk_score": 50, "roi_score": 50, "risk_factors": [], "roi_factors": [], "recommendation": "moderate", "reasoning": "No AI provider configured"}'
            return Response()

    def get_llm(settings, temperature=0.0, **kwargs):
        return NoopLLM()

try:
    from ...ai.prompts.program_analysis import prompt as analysis_prompt
except ImportError:
    analysis_prompt = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/programs", tags=["programs"])


# ─── Schemas ────────────────────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    program_source: str = Field(..., pattern=r"^(hackerone|bugcrowd|intigriti)$")
    program_slug: str = Field(..., min_length=1, max_length=255)


class AnalyzeResponse(BaseModel):
    id: int
    risk_score: float
    roi_score: float
    priority_score: float
    recommendation: str
    reasoning: str
    risk_factors: list[str]
    roi_factors: list[str]


class ProgramSummary(BaseModel):
    id: int
    program_name: str
    program_source: str
    program_slug: str
    risk_score: float
    roi_score: float
    priority_score: float
    bounty_min: int | None = None
    bounty_max: int | None = None
    analyzed_at: datetime


class ProgramDetail(ProgramSummary):
    avg_bounty: int | None = None
    response_time_days: int | None = None
    scope_size: int | None = None
    vulnerability_count: int | None = None
    severity_distribution: dict | None = None
    recommendation: str = ""
    reasoning: str = ""
    risk_factors: list[str] = []
    roi_factors: list[str] = []
    created_at: datetime


# ─── Endpoints ──────────────────────────────────────────────────────────


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_program(
    req: AnalyzeRequest,
    _auth: bool = Depends(verify_auth),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    settings = load_settings()

    client = ProgramClient(settings)
    meta = await client.get_program_metadata(req.program_source, req.program_slug)

    llm = get_llm(settings, temperature=0.0, tier="fast")

    if analysis_prompt is None:
        raise HTTPException(status_code=500, detail="Analysis prompt not available")

    messages = analysis_prompt.format_messages(
        program_name=meta.program_name,
        program_source=meta.program_source,
        bounty_min=meta.bounty_min or 0,
        bounty_max=meta.bounty_max or 0,
        avg_bounty=meta.avg_bounty or 0,
        scope_size=meta.scope_size or 0,
        vulnerability_count=meta.vulnerability_count or 0,
        severity_distribution=json.dumps(meta.severity_distribution or {}),
        response_time_days=meta.response_time_days or 0,
    )

    try:
        llm_response = await llm.ainvoke(messages)
        raw = llm_response.content if hasattr(llm_response, "content") else str(llm_response)
        result = json.loads(raw)
    except Exception as e:
        logger.warning("LLM analysis failed for %s/%s: %s", req.program_source, req.program_slug, e)
        result = {
            "risk_score": 50,
            "roi_score": 50,
            "risk_factors": [],
            "roi_factors": [],
            "recommendation": "moderate",
            "reasoning": "Analysis failed — defaulting to moderate",
        }

    now = datetime.now(timezone.utc)
    priority_score = 0.6 * result.get("roi_score", 50) + 0.4 * result.get("risk_score", 50)

    record = ProgramAnalysis(
        user_id=user_id,
        program_source=req.program_source,
        program_name=meta.program_name,
        program_slug=req.program_slug,
        bounty_min=meta.bounty_min,
        bounty_max=meta.bounty_max,
        avg_bounty=meta.avg_bounty,
        response_time_days=meta.response_time_days,
        scope_size=meta.scope_size,
        vulnerability_count=meta.vulnerability_count,
        severity_distribution=meta.severity_distribution,
        risk_score=result.get("risk_score", 50),
        roi_score=result.get("roi_score", 50),
        priority_score=priority_score,
        analyzed_at=now,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)

    return AnalyzeResponse(
        id=record.id,
        risk_score=record.risk_score,
        roi_score=record.roi_score,
        priority_score=record.priority_score,
        recommendation=result.get("recommendation", "moderate"),
        reasoning=result.get("reasoning", ""),
        risk_factors=result.get("risk_factors", []),
        roi_factors=result.get("roi_factors", []),
    )


@router.get("", response_model=list[ProgramSummary])
async def list_programs(
    sort: str = Query("priority", pattern=r"^(priority|roi|risk)$"),
    _auth: bool = Depends(verify_auth),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    sort_map = {
        "priority": ProgramAnalysis.priority_score,
        "roi": ProgramAnalysis.roi_score,
        "risk": ProgramAnalysis.risk_score,
    }
    order_col = sort_map.get(sort, ProgramAnalysis.priority_score)

    stmt = (
        select(ProgramAnalysis)
        .where(ProgramAnalysis.user_id == user_id)
        .order_by(desc(order_col))
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [
        ProgramSummary(
            id=r.id,
            program_name=r.program_name,
            program_source=r.program_source,
            program_slug=r.program_slug,
            risk_score=r.risk_score,
            roi_score=r.roi_score,
            priority_score=r.priority_score,
            bounty_min=r.bounty_min,
            bounty_max=r.bounty_max,
            analyzed_at=r.analyzed_at,
        )
        for r in rows
    ]


@router.get("/{program_id}", response_model=ProgramDetail)
async def get_program(
    program_id: int,
    _auth: bool = Depends(verify_auth),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    stmt = select(ProgramAnalysis).where(
        ProgramAnalysis.id == program_id,
        ProgramAnalysis.user_id == user_id,
    )
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()

    if record is None:
        raise HTTPException(status_code=404, detail="Program analysis not found")

    return ProgramDetail(
        id=record.id,
        program_name=record.program_name,
        program_source=record.program_source,
        program_slug=record.program_slug,
        risk_score=record.risk_score,
        roi_score=record.roi_score,
        priority_score=record.priority_score,
        bounty_min=record.bounty_min,
        bounty_max=record.bounty_max,
        avg_bounty=record.avg_bounty,
        response_time_days=record.response_time_days,
        scope_size=record.scope_size,
        vulnerability_count=record.vulnerability_count,
        severity_distribution=record.severity_distribution,
        recommendation="",
        reasoning="",
        risk_factors=[],
        roi_factors=[],
        analyzed_at=record.analyzed_at,
        created_at=record.created_at,
    )


__all__ = ["router"]
