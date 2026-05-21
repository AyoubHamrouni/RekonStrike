from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, ForeignKey, DateTime, Text, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ScanSession(Base):
    __tablename__ = "scan_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    program_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("programs.id", ondelete="SET NULL"), nullable=True
    )
    workflow: Mapped[str] = mapped_column(String(50), default="wildcard")
    config_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="running")
    current_phase: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    stats: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    step_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class ScanArtifact(Base):
    __tablename__ = "scan_artifacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    scan_session_id: Mapped[int] = mapped_column(
        ForeignKey("scan_sessions.id", ondelete="CASCADE")
    )
    artifact_type: Mapped[str] = mapped_column(String(50))
    path: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


__all__ = [
    "ScanSession", "ScanArtifact",
]
