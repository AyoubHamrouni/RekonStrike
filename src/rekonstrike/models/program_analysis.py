from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, Float, ForeignKey, DateTime, Text, JSON, func,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ProgramAnalysis(Base):
    __tablename__ = "program_analyses"
    __table_args__ = (
        UniqueConstraint("user_id", "program_source", "program_slug", name="uq_program_analysis_per_user"),
        Index("ix_program_analysis_priority", "priority_score"),
        Index("ix_program_analysis_analyzed", "analyzed_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    program_source: Mapped[str] = mapped_column(String(50))
    program_name: Mapped[str] = mapped_column(Text, default="")
    program_slug: Mapped[str] = mapped_column(String(255))
    bounty_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bounty_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    avg_bounty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_time_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    scope_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vulnerability_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    severity_distribution: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    roi_score: Mapped[float] = mapped_column(Float, default=0.0)
    priority_score: Mapped[float] = mapped_column(Float, default=0.0)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


__all__ = ["ProgramAnalysis"]
