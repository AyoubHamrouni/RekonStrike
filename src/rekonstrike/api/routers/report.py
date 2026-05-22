"""Report generation API — generate, list, and download security reports."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import verify_auth, get_current_user, get_db_session
from ...config import load_settings
from ...database import Report, TestingSession
from ...services.report_service import ReportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/targets/{target_id}/report", tags=["report"])


# ─── Schemas ───────────────────────────────────────────────────────────


class GenerateRequest(BaseModel):
    testing_session_id: int
    format: str = Field(default="markdown", pattern=r"^(markdown|pdf|html)$")


class GenerateResponse(BaseModel):
    report_id: int
    url: str


class ReportSummary(BaseModel):
    id: int
    title: str
    format: str
    findings_count: int
    generated_at: str

    class Config:
        from_attributes = True


# ─── Endpoints ─────────────────────────────────────────────────────────


@router.post("/generate", response_model=GenerateResponse)
async def generate_report(
    target_id: int,
    body: GenerateRequest,
    _auth: bool = Depends(verify_auth),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    settings = load_settings()

    stmt = select(TestingSession).where(
        TestingSession.id == body.testing_session_id,
        TestingSession.target_id == target_id,
    )
    result = await session.execute(stmt)
    tsess = result.scalar_one_or_none()
    if tsess is None:
        raise HTTPException(status_code=404, detail="Testing session not found for this target")

    service = ReportService(session, settings)
    report = await service.generate_report(
        target_id=target_id,
        testing_session_id=body.testing_session_id,
        user_id=user_id,
        fmt=body.format,
    )

    return GenerateResponse(
        report_id=report.id,
        url=f"/api/v1/reports/{report.id}/download",
    )


@router.get("/reports", response_model=list[ReportSummary])
async def list_reports(
    target_id: int,
    _auth: bool = Depends(verify_auth),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    stmt = (
        select(Report)
        .where(Report.target_id == target_id, Report.user_id == user_id)
        .order_by(desc(Report.generated_at))
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return [
        ReportSummary(
            id=r.id,
            title=r.title,
            format=r.format,
            findings_count=r.findings_count,
            generated_at=r.generated_at.isoformat(),
        )
        for r in rows
    ]


# Separate prefix-free router for the download endpoint
download_router = APIRouter(prefix="/reports", tags=["report"])


@download_router.get("/{report_id}/download")
async def download_report(
    report_id: int,
    format: str = Query("markdown", pattern=r"^(markdown|pdf|html)$"),
    user_id: int = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    _auth: bool = Depends(verify_auth),
):
    stmt = select(Report).where(Report.id == report_id, Report.user_id == user_id)
    result = await session.execute(stmt)
    report = result.scalar_one_or_none()

    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    content = report.content
    fmt = format

    if fmt != report.format:
        from ...services.report_service import _markdown_to_html
        if report.format == "markdown" and fmt == "html":
            content = _markdown_to_html(report.content)
        elif report.format == "markdown" and fmt == "pdf":
            from ...services.report_service import _generate_pdf
            pdf_bytes = _generate_pdf(report.content)
            content = pdf_bytes.decode("latin-1", errors="replace")
        else:
            content = report.content

    report.exported_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    await session.commit()

    content_type = {
        "markdown": "text/markdown; charset=utf-8",
        "html": "text/html; charset=utf-8",
        "pdf": "application/pdf",
    }.get(fmt, "text/plain")

    filename = f"report_{report_id}.{fmt}"

    if fmt == "pdf":
        raw = content.encode("latin-1") if isinstance(content, str) else content
        return Response(
            content=raw,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


__all__ = ["router", "download_router"]
