from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Boolean, Integer, ForeignKey, DateTime, JSON, func, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class ScopeTarget(Base):
    __tablename__ = "scope_targets"
    id: Mapped[int] = mapped_column(primary_key=True)
    target: Mapped[str] = mapped_column(String(255), unique=True)
    target_type: Mapped[str] = mapped_column(String(50), default="wildcard")
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=1
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class Subdomain(Base):
    __tablename__ = "subdomains"
    __table_args__ = (
        UniqueConstraint("target_id", "subdomain", name="uq_subdomain_per_target"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("scope_targets.id", ondelete="CASCADE"))
    subdomain: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(100), default="passive")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    cname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_addresses: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class LiveHost(Base):
    __tablename__ = "live_hosts"
    __table_args__ = (
        UniqueConstraint("url", name="uq_live_host_url"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("scope_targets.id", ondelete="CASCADE"))
    subdomain_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("subdomains.id", ondelete="SET NULL"), nullable=True
    )
    url: Mapped[str] = mapped_column(String(1024))
    raw_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    technologies: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    content_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    web_server: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    response_headers: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    waf_detected: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    screenshot_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    ssl_info: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    roi_score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    subdomain_rel: Mapped[Optional["Subdomain"]] = relationship()


class Endpoint(Base):
    __tablename__ = "endpoints"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    live_host_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("live_hosts.id", ondelete="CASCADE"), nullable=True
    )
    url: Mapped[str] = mapped_column(String(1024))
    content_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class DNSRecord(Base):
    __tablename__ = "dns_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    subdomain: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(20), default="A")
    value: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


__all__ = [
    "ScopeTarget", "Subdomain", "LiveHost", "Endpoint", "DNSRecord",
]
