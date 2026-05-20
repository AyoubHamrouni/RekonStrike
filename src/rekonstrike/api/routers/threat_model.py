import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import verify_auth, get_target_repo, get_host_repo, get_db_session, settings
from ...repositories.target_repo import TargetRepository
from ...repositories.host_repo import HostRepository
from ...database import AIInsight
from ...ai.schemas.threat_model_input import SurfaceCaptureInput, build_llm_input, Anomaly
from ...ai.schemas.threat_model_output import ThreatAssessment, empty_assessment
from ...ai.agents.threat_model_agent import run_threat_model
from ...config import load_settings
from ...database import get_database as get_db
import hashlib
import json
import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/targets/{target_id}/threat-model", tags=["threat_model"])


@router.post("/analyze")
async def analyze_threat_model(
    target_id: int,
    tier: str = Query("fast", description="Analysis tier: 'fast' (cheap, ~3-5s) or 'deep' (thorough, ~20-40s)"),
    program_id: int | None = Query(None, description="Optional program ID for scope filtering"),
    auth: bool = Depends(verify_auth),
    repo: TargetRepository = Depends(get_target_repo),
    session: AsyncSession = Depends(get_db_session),
):
    if tier not in ("fast", "deep"):
        raise HTTPException(status_code=400, detail="tier must be 'fast' or 'deep'")

    target = await repo.get(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    raw_captures = await _fetch_raw_captures(session, target_id, program_id, limit=500)
    anomalies = await _fetch_anomalies(session, target_id)

    max_families = 10 if tier == "deep" else 20
    max_eps = 5 if tier == "deep" else 15
    surface = build_llm_input(
        raw_captures=raw_captures,
        anomalies=anomalies,
        target=target.target,
        max_families=max_families,
        max_endpoints_per_family=max_eps,
    )

    if not surface.request_count and not surface.resource_families:
        return empty_assessment(target=target.target, model=tier).model_dump()

    input_hash = hashlib.sha256(
        (surface.model_dump_json() + tier).encode()
    ).hexdigest()

    cached = await _get_cached_insight(session, target_id, "threat_model", input_hash, tier)
    if cached:
        return cached

    questioning_answers = await _fetch_questioning_answers(session, target_id)

    try:
        assessment = await run_threat_model(
            settings, surface,
            user_answers=questioning_answers,
            tier=tier,
        )
    except Exception as e:
        logger.error(f"Threat model failed for target {target_id}: {e}")
        return empty_assessment(target=target.target, model=tier).model_dump()

    await _store_insight(
        session, target_id, "threat_model", input_hash, tier,
        assessment.model_dump(),
    )

    return assessment.model_dump()


@router.patch("/findings/{finding_index}")
async def update_finding_status(
    target_id: int,
    finding_index: int,
    user_status: str = Query(..., description="confirmed, dismissed, or default"),
    user_notes: str = Query("", description="Optional user notes"),
    auth: bool = Depends(verify_auth),
    session: AsyncSession = Depends(get_db_session),
):
    latest = await _get_latest_insight(session, target_id, "threat_model")
    if not latest:
        raise HTTPException(status_code=404, detail="No threat model results found")

    result = latest.result if isinstance(latest.result, dict) else json.loads(latest.result)
    findings = result.get("findings", [])

    if finding_index < 0 or finding_index >= len(findings):
        raise HTTPException(status_code=404, detail=f"Finding index {finding_index} out of range")

    findings[finding_index] = {
        **findings[finding_index],
        "user_status": user_status,
        "user_notes": user_notes,
    }
    result["findings"] = findings
    latest.result = result

    await session.commit()
    return {"status": "ok", "finding_index": finding_index, "user_status": user_status}


@router.get("/findings")
async def get_findings(
    target_id: int,
    auth: bool = Depends(verify_auth),
    session: AsyncSession = Depends(get_db_session),
):
    latest = await _get_latest_insight(session, target_id, "threat_model")
    if not latest:
        return {"findings": []}
    result = latest.result if isinstance(latest.result, dict) else json.loads(latest.result)
    return result


async def _fetch_raw_captures(
    session: AsyncSession,
    target_id: int,
    program_id: int | None,
    limit: int = 500,
) -> list[dict]:
    from sqlalchemy import select, text

    if program_id:
        stmt = text("""
            SELECT method, url, hostname, path, query_string, headers, body_size, timestamp
            FROM raw_http_captures
            WHERE program_id = :program_id
            ORDER BY timestamp DESC
            LIMIT :limit
        """)
        result = await session.execute(stmt, {"program_id": program_id, "limit": limit})
    else:
        stmt = text("""
            SELECT method, url, hostname, path, query_string, headers, body_size, timestamp
            FROM raw_http_captures
            WHERE hostname IN (
                SELECT subdomain FROM subdomains WHERE target_id = :target_id
            )
            ORDER BY timestamp DESC
            LIMIT :limit
        """)
        result = await session.execute(stmt, {"target_id": target_id, "limit": limit})

    rows = []
    for row in result.mappings():
        rows.append(dict(row))
    return rows


async def _fetch_anomalies(
    session: AsyncSession,
    target_id: int,
) -> list[Anomaly]:
    from sqlalchemy import text

    stmt = text("""
        SELECT result->'anomalies' AS anomalies
        FROM ai_insights
        WHERE target_id = :target_id
          AND insight_type = 'filter_anomalies'
        ORDER BY created_at DESC
        LIMIT 1
    """)
    result = await session.execute(stmt, {"target_id": target_id})
    row = result.mappings().first()
    if not row:
        return []
    anomalies_data = row.get("anomalies", [])
    if isinstance(anomalies_data, str):
        anomalies_data = json.loads(anomalies_data)
    return [Anomaly(**a) for a in anomalies_data if isinstance(a, dict)]


async def _fetch_questioning_answers(
    session: AsyncSession,
    target_id: int,
) -> list[dict[str, str]] | None:
    from sqlalchemy import text

    stmt = text("""
        SELECT result->'answers' AS answers
        FROM ai_insights
        WHERE target_id = :target_id
          AND insight_type = 'questioning_answers'
        ORDER BY created_at DESC
        LIMIT 1
    """)
    result = await session.execute(stmt, {"target_id": target_id})
    row = result.mappings().first()
    if not row:
        return None
    answers = row.get("answers", [])
    if isinstance(answers, str):
        answers = json.loads(answers)
    return answers if isinstance(answers, list) else None


async def _get_cached_insight(
    session: AsyncSession,
    target_id: int,
    insight_type: str,
    input_hash: str,
    model_used: str,
) -> dict | None:
    from sqlalchemy import select

    stmt = select(AIInsight).where(
        AIInsight.target_id == target_id,
        AIInsight.insight_type == insight_type,
        AIInsight.input_hash == input_hash,
        AIInsight.model_used == model_used,
    ).order_by(AIInsight.created_at.desc()).limit(1)

    result = await session.execute(stmt)
    insight = result.scalar_one_or_none()
    if not insight:
        return None
    res = insight.result if isinstance(insight.result, dict) else json.loads(insight.result)
    res["_cached"] = True
    return res


async def _get_latest_insight(
    session: AsyncSession,
    target_id: int,
    insight_type: str,
) -> AIInsight | None:
    from sqlalchemy import select

    stmt = select(AIInsight).where(
        AIInsight.target_id == target_id,
        AIInsight.insight_type == insight_type,
    ).order_by(AIInsight.created_at.desc()).limit(1)

    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def _store_insight(
    session: AsyncSession,
    target_id: int,
    insight_type: str,
    input_hash: str,
    model_used: str,
    result: dict,
):
    insight = AIInsight(
        target_id=target_id,
        insight_type=insight_type,
        input_hash=input_hash,
        model_used=model_used,
        result=result,
    )
    session.add(insight)
    await session.commit()
