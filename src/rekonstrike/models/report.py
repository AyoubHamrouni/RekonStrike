from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, ForeignKey, DateTime, Text, JSON, func, Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_report_target_generated", "target_id", "generated_at"),
        Index("ix_report_user_generated", "user_id", "generated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE"), nullable=False
    )
    testing_session_id: Mapped[int] = mapped_column(
        ForeignKey("testing_sessions.id", ondelete="SET NULL"), nullable=False
    )
    format: Mapped[str] = mapped_column(String(20), default="markdown")
    title: Mapped[str] = mapped_column(Text, default="")
    executive_summary: Mapped[str] = mapped_column(Text, default="")
    severity_breakdown: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    findings_count: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text, default="")
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    exported_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


__all__ = ["Report"]
