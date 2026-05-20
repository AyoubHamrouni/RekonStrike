import logging
import json
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_core.output_parsers import JsonOutputParser

from ..deps import verify_auth, get_target_repo, get_db_session, settings
from ...repositories.target_repo import TargetRepository
from ...database import AIInsight
from ...ai.factory import get_llm
from ...ai.schemas.threat_model_input import build_llm_input
from ...ai.prompts.questioning import prompt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/targets/{target_id}/questioning", tags=["questioning"])


class QAItem(BaseModel):
    question: str
    answer: str


class QuestioningSession(BaseModel):
    questions: list[str]
    answers: list[QAItem] = []


@router.post("/generate")
async def generate_questions(
    target_id: int,
    program_id: int | None = None,
    auth: bool = Depends(verify_auth),
    repo: TargetRepository = Depends(get_target_repo),
    session: AsyncSession = Depends(get_db_session),
):
    target = await repo.get(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    existing = await _get_existing_questions(session, target_id)
    if existing:
        return existing

    raw_captures = await _fetch_raw_captures(session, target_id, program_id, limit=200)
    surface = build_llm_input(raw_captures, target=target.target, max_families=15, max_endpoints_per_family=10)

    if not surface.request_count and not surface.resource_families:
        return {"questions": []}

    llm = get_llm(settings, temperature=0.3, tier="fast")
    chain = prompt | llm | JsonOutputParser()

    try:
        result = await chain.ainvoke({"surface_json": surface.model_dump_json(indent=2)})
        questions = result.get("questions", []) if isinstance(result, dict) else []
    except Exception as e:
        logger.error(f"Failed to generate questions: {e}")
        return {"questions": []}

    await _store_questions(session, target_id, questions)
    return {"questions": questions}


@router.post("/submit")
async def submit_answers(
    target_id: int,
    answers: list[QAItem],
    auth: bool = Depends(verify_auth),
    session: AsyncSession = Depends(get_db_session),
):
    existing = await _get_existing_questions(session, target_id)
    questions = existing.get("questions", []) if existing else []

    qa_pairs = [
        {"question": qa.question, "answer": qa.answer}
        for qa in answers
    ]

    insight = AIInsight(
        target_id=target_id,
        insight_type="questioning_answers",
        input_hash=hashlib.sha256(str(qa_pairs).encode()).hexdigest(),
        model_used="user_submitted",
        result={"answers": qa_pairs, "questions": questions},
    )
    session.add(insight)
    await session.commit()

    return {"status": "ok", "answer_count": len(qa_pairs)}


@router.get("/session")
async def get_questioning_session(
    target_id: int,
    auth: bool = Depends(verify_auth),
    session: AsyncSession = Depends(get_db_session),
):
    existing = await _get_existing_questions(session, target_id)
    if not existing:
        return {"questions": [], "answers": []}

    answers_insight = await _get_latest_answers(session, target_id)
    answers = answers_insight.get("answers", []) if answers_insight else []

    return {
        "questions": existing.get("questions", []),
        "answers": answers,
    }


async def _get_existing_questions(session: AsyncSession, target_id: int) -> dict | None:
    stmt = select(AIInsight).where(
        AIInsight.target_id == target_id,
        AIInsight.insight_type == "questioning_questions",
    ).order_by(AIInsight.created_at.desc()).limit(1)
    result = await session.execute(stmt)
    insight = result.scalar_one_or_none()
    if not insight:
        return None
    return insight.result if isinstance(insight.result, dict) else json.loads(insight.result)


async def _get_latest_answers(session: AsyncSession, target_id: int) -> dict | None:
    stmt = select(AIInsight).where(
        AIInsight.target_id == target_id,
        AIInsight.insight_type == "questioning_answers",
    ).order_by(AIInsight.created_at.desc()).limit(1)
    result = await session.execute(stmt)
    insight = result.scalar_one_or_none()
    if not insight:
        return None
    return insight.result if isinstance(insight.result, dict) else json.loads(insight.result)


async def _store_questions(session: AsyncSession, target_id: int, questions: list[str]):
    insight = AIInsight(
        target_id=target_id,
        insight_type="questioning_questions",
        input_hash="generated",
        model_used="fast",
        result={"questions": questions},
    )
    session.add(insight)
    await session.commit()


async def _fetch_raw_captures(
    session: AsyncSession,
    target_id: int,
    program_id: int | None,
    limit: int = 200,
) -> list[dict]:
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

    return [dict(row) for row in result.mappings()]
