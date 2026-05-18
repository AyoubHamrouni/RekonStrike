from datetime import datetime
from functools import lru_cache
from typing import Optional
from sqlalchemy import (
    String, Boolean, Integer, ForeignKey, DateTime, Text, JSON, func, UniqueConstraint
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from .config import load_settings
from urllib.parse import urlparse
import re


class Base(DeclarativeBase):
    pass


class ScopeTarget(Base):
    __tablename__ = "scope_targets"
    id: Mapped[int] = mapped_column(primary_key=True)
    target: Mapped[str] = mapped_column(String(255), unique=True)
    target_type: Mapped[str] = mapped_column(String(50), default="wildcard")
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
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    technologies: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    waf_detected: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    roi_score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    subdomain_rel: Mapped[Optional["Subdomain"]] = relationship()


def normalize_host(raw: str) -> str:
    """Normalize a URL or host string to a lowercase hostname without scheme,
    trailing slashes, or default ports 80/443.
    Examples:
      normalize_host('https://API.Example.com:443/') -> 'api.example.com'
      normalize_host('http://example.com:8080/path') -> 'example.com:8080'
    """
    if not raw:
        return ""
    raw = raw.strip()
    # If it doesn't look like a URL, prepend scheme to help urlparse
    if not re.match(r"^[a-zA-Z]+://", raw):
        raw_for_parse = "//" + raw
    else:
        raw_for_parse = raw
    parsed = urlparse(raw_for_parse)
    host = parsed.hostname or ""
    port = parsed.port
    host = host.lower()
    # Only include non-default ports
    if port and port not in (80, 443):
        return f"{host}:{port}"
    return host


class Program(Base):
    __tablename__ = "programs"
    id: Mapped[int] = mapped_column(primary_key=True)
    scope_target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    platform: Mapped[str] = mapped_column(String(50))
    program_handle: Mapped[str] = mapped_column(String(255))
    program_name: Mapped[str] = mapped_column(String(255))
    bounty_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bounty_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    scopes: Mapped[list["ProgramScope"]] = relationship(
        back_populates="program", cascade="all, delete-orphan"
    )


class ProgramScope(Base):
    __tablename__ = "program_scopes"
    id: Mapped[int] = mapped_column(primary_key=True)
    program_id: Mapped[int] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE")
    )
    in_scope: Mapped[list] = mapped_column(JSON, default=list)
    out_of_scope: Mapped[list] = mapped_column(JSON, default=list)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    program: Mapped["Program"] = relationship(back_populates="scopes")


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
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    step_count: Mapped[int] = mapped_column(Integer, default=0)
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
    status: Mapped[str] = mapped_column(String(50), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


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


class ScanArtifact(Base):
    __tablename__ = "scan_artifacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    scan_session_id: Mapped[int] = mapped_column(
        ForeignKey("scan_sessions.id", ondelete="CASCADE")
    )
    artifact_type: Mapped[str] = mapped_column(String(50))
    path: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


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


class Database:
    def __init__(self, url: str):
        self.engine = create_async_engine(url)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def create_all(self):
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    def get_session(self) -> AsyncSession:
        return self.session_factory()

    async def close(self):
        await self.engine.dispose()


@lru_cache(maxsize=2)
def get_database(url: str | None = None) -> Database:
    if not url:
        url = load_settings().database_url
    return Database(url)
