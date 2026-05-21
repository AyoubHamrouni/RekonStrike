from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import (
    String, Boolean, Integer, ForeignKey, DateTime, Text, JSON, func,
    UniqueConstraint, Index, LargeBinary,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class RawHTTPCapture(Base):
    __tablename__ = "raw_http_captures"
    __table_args__ = (
        Index("ix_raw_http_program_timestamp", "program_id", "timestamp"),
        Index("ix_raw_http_hostname_scope", "hostname", "scope_matched"),
        UniqueConstraint("program_id", "user_id", "timestamp", name="uq_raw_http_program_user_ts"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    program_id: Mapped[int] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    method: Mapped[str] = mapped_column(String(16))
    url: Mapped[str] = mapped_column(Text)
    hostname: Mapped[str] = mapped_column(String(255), index=True)
    path: Mapped[str] = mapped_column(Text)
    query_string: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    headers: Mapped[dict] = mapped_column(JSON, default=dict)
    body: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    body_size: Mapped[int] = mapped_column(Integer, default=0)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
    scope_matched: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)


class BrowserCapture(Base):
    __tablename__ = "browser_captures"
    __table_args__ = (
        Index("ix_browser_capture_target_session", "target_id", "scan_session_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    scan_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("scan_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    url: Mapped[str] = mapped_column(String(1024))
    rendered_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    network_logs: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    cookies_set: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    local_storage: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    session_storage: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    javascript_errors: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    execution_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    screenshot_base64: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    js_bundles: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    source_maps: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


__all__ = [
    "RawHTTPCapture", "BrowserCapture",
]
