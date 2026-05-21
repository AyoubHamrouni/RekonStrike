from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, ForeignKey, DateTime, Text, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AIInsight(Base):
    __tablename__ = "ai_insights"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    insight_type: Mapped[str] = mapped_column(String(50))
    input_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    model_used: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class AIVectorMemory(Base):
    __tablename__ = "ai_vector_memory"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("scope_targets.id", ondelete="CASCADE"))
    memory_type: Mapped[str] = mapped_column(String(50))
    content: Mapped[str] = mapped_column(Text)
    embedding_model: Mapped[str] = mapped_column(String(100), default="")
    metadata_: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    scan_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("scan_sessions.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(50), default="medium")
    source: Mapped[str] = mapped_column(String(50), default="nuclei")
    template_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    matched_at: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proof_of_concept: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    curl_command: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class FindingReport(Base):
    __tablename__ = "finding_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    vulnerability_id: Mapped[int] = mapped_column(
        ForeignKey("vulnerabilities.id", ondelete="CASCADE")
    )
    platform: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text, default="")
    steps_to_reproduce: Mapped[str] = mapped_column(Text, default="")
    impact: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(50), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )


class SecretFinding(Base):
    __tablename__ = "secret_findings"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    source_url: Mapped[str] = mapped_column(String(1024), default="")
    detector_name: Mapped[str] = mapped_column(String(100), default="")
    raw_secret: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    redacted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class TakeoverFinding(Base):
    __tablename__ = "takeover_findings"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    subdomain: Mapped[str] = mapped_column(String(255), default="")
    service: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


__all__ = [
    "AIInsight", "AIVectorMemory",
    "Vulnerability", "FindingReport", "SecretFinding", "TakeoverFinding",
]
