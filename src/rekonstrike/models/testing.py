from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Boolean, Integer, ForeignKey, DateTime, Text, func, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class TestingSession(Base):
    __tablename__ = "testing_sessions"
    __table_args__ = (
        Index("ix_testing_session_target_user", "target_id", "user_id"),
        Index("ix_testing_session_status", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    threat_model_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("ai_insights.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    findings_tested: Mapped[int] = mapped_column(Integer, default=0)
    findings_confirmed: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class TestResult(Base):
    __tablename__ = "test_results"
    __table_args__ = (
        UniqueConstraint("testing_session_id", "finding_id", name="uq_session_finding"),
        Index("ix_test_result_session_confirmed", "testing_session_id", "confirmed"),
        Index("ix_test_result_finding", "finding_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    testing_session_id: Mapped[int] = mapped_column(
        ForeignKey("testing_sessions.id", ondelete="CASCADE")
    )
    finding_id: Mapped[int] = mapped_column(Integer)
    endpoint: Mapped[str] = mapped_column(String(1024))
    payload: Mapped[str] = mapped_column(Text, default="")
    response_status: Mapped[int] = mapped_column(Integer, default=0)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tested_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


__all__ = [
    "TestingSession", "TestResult",
]
