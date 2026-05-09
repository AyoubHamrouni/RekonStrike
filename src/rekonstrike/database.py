"""Async database layer — SQLAlchemy 2.1+ with PostgreSQL (primary) and SQLite (fallback)"""

from pathlib import Path
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
    AsyncEngine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import (
    String,
    Integer,
    Boolean,
    Text,
    Float,
    JSON,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    select,
    func,
)
from pgvector.sqlalchemy import Vector

from .config import Settings


# ─── URL Normalization ─────────────────────────────────────────────────────────


def normalize_host(raw: str) -> str:
    """Strip scheme, port, trailing slash, and wildcard prefix from a URL or hostname."""
    from urllib.parse import urlparse

    raw = raw.strip().lower()
    if raw.startswith("*."):
        raw = raw[2:]
    if raw.startswith(("http://", "https://")):
        parsed = urlparse(raw)
        host = parsed.hostname or raw
    else:
        host = raw
    for port in (":80", ":443"):
        if host.endswith(port):
            host = host[: -len(port)]
            break
    host = host.rstrip("/")
    return host


class Base(DeclarativeBase):
    pass


# ─── Models ───────────────────────────────────────────────────────────────────


class ScopeTarget(Base):
    __tablename__ = "scope_targets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    target_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )  # wildcard | domain | url | cidr | company
    program: Mapped[Optional[str]] = mapped_column(String(255))
    in_scope: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    subdomains = relationship(
        "Subdomain", back_populates="target", cascade="all, delete-orphan"
    )
    dns_records = relationship(
        "DNSRecord", back_populates="target", cascade="all, delete-orphan"
    )
    sessions = relationship(
        "ScanSession", back_populates="target", cascade="all, delete-orphan"
    )
    program_scopes = relationship(
        "ProgramScope", back_populates="target", cascade="all, delete-orphan"
    )
    secret_findings = relationship(
        "SecretFinding", back_populates="target", cascade="all, delete-orphan"
    )
    ai_insights = relationship(
        "AIInsight", back_populates="target", cascade="all, delete-orphan"
    )


class ProgramScope(Base):
    __tablename__ = "program_scopes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    platform: Mapped[str] = mapped_column(
        String(20)
    )  # hackerone|bugcrowd|intigriti|manual
    program_handle: Mapped[str] = mapped_column(String(255))
    in_scope: Mapped[list[str]] = mapped_column(JSON, default=list)
    out_of_scope: Mapped[list[str]] = mapped_column(JSON, default=list)
    bounty_min: Mapped[Optional[int]] = mapped_column(Integer)
    bounty_max: Mapped[Optional[int]] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    target = relationship("ScopeTarget", back_populates="program_scopes")


class Subdomain(Base):
    __tablename__ = "subdomains"
    __table_args__ = (
        UniqueConstraint("target_id", "subdomain", name="uq_subdomain_per_target"),
        Index("ix_subdomain_target", "target_id"),
        Index("ix_subdomain_resolved", "resolved"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    subdomain: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    target = relationship("ScopeTarget", back_populates="subdomains")
    live_hosts = relationship(
        "LiveHost", back_populates="subdomain", cascade="all, delete-orphan"
    )


class DNSRecord(Base):
    __tablename__ = "dns_records"
    __table_args__ = (
        Index("ix_dns_target", "target_id"),
        Index("ix_dns_domain", "domain"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    record_type: Mapped[str] = mapped_column(String(10), nullable=False)
    record_value: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    target = relationship("ScopeTarget", back_populates="dns_records")


class SecretFinding(Base):
    __tablename__ = "secret_findings"
    __table_args__ = (
        Index("ix_secret_target", "target_id"),
        Index("ix_secret_detector", "detector_name"),
        Index("ix_secret_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    source_url: Mapped[Optional[str]] = mapped_column(String(2048))
    detector_name: Mapped[str] = mapped_column(String(100))
    raw_secret: Mapped[Optional[str]] = mapped_column(Text)
    redacted: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    target = relationship("ScopeTarget", back_populates="secret_findings")


class LiveHost(Base):
    __tablename__ = "live_hosts"
    __table_args__ = (
        UniqueConstraint("url", name="uq_live_host_url"),
        Index("ix_live_host_subdomain", "subdomain_id"),
        Index("ix_live_host_roi", "roi_score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subdomain_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("subdomains.id", ondelete="SET NULL")
    )
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    raw_url: Mapped[Optional[str]] = mapped_column(String(1024))
    status_code: Mapped[Optional[int]] = mapped_column(Integer)
    title: Mapped[Optional[str]] = mapped_column(String(500))
    technologies: Mapped[Optional[dict]] = mapped_column(JSON)
    content_length: Mapped[Optional[int]] = mapped_column(Integer)
    web_server: Mapped[Optional[str]] = mapped_column(String(100))
    response_headers: Mapped[Optional[dict]] = mapped_column(JSON)
    screenshot_path: Mapped[Optional[str]] = mapped_column(String(500))
    ssl_info: Mapped[Optional[dict]] = mapped_column(JSON)
    roi_score: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    subdomain = relationship("Subdomain", back_populates="live_hosts")
    endpoints = relationship(
        "Endpoint", back_populates="live_host", cascade="all, delete-orphan"
    )
    vulnerabilities = relationship(
        "Vulnerability", back_populates="live_host", cascade="all, delete-orphan"
    )


class Endpoint(Base):
    __tablename__ = "endpoints"
    __table_args__ = (Index("ix_endpoint_live_host", "live_host_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    live_host_id: Mapped[int] = mapped_column(
        ForeignKey("live_hosts.id", ondelete="CASCADE")
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    method: Mapped[str] = mapped_column(String(10), default="GET")
    status_code: Mapped[Optional[int]] = mapped_column(Integer)
    content_type: Mapped[Optional[str]] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    live_host = relationship("LiveHost", back_populates="endpoints")


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    __table_args__ = (
        Index("ix_vuln_live_host", "live_host_id"),
        Index("ix_vuln_severity", "severity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    live_host_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("live_hosts.id", ondelete="SET NULL")
    )
    template_id: Mapped[Optional[str]] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(500))
    severity: Mapped[str] = mapped_column(String(20), default="unknown")
    description: Mapped[Optional[str]] = mapped_column(Text)
    matched_at: Mapped[Optional[str]] = mapped_column(String(1024))
    curl_command: Mapped[Optional[str]] = mapped_column(Text)
    fp_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    live_host = relationship("LiveHost", back_populates="vulnerabilities")


class TakeoverFinding(Base):
    __tablename__ = "takeover_findings"
    __table_args__ = (
        Index("ix_takeover_subdomain", "subdomain_id"),
        Index("ix_takeover_service", "service"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subdomain_id: Mapped[int] = mapped_column(
        ForeignKey("subdomains.id", ondelete="CASCADE")
    )
    service: Mapped[str] = mapped_column(String(100))
    cname_value: Mapped[str] = mapped_column(String(500))
    fingerprint_matched: Mapped[str] = mapped_column(Text)
    confidence: Mapped[str] = mapped_column(String(20))
    status_code: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class AIInsight(Base):
    __tablename__ = "ai_insights"
    __table_args__ = (
        UniqueConstraint(
            "target_id", "insight_type", "input_hash", name="uq_ai_insight"
        ),
        Index("ix_ai_insight_target", "target_id"),
        Index("ix_ai_insight_type", "insight_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    insight_type: Mapped[str] = mapped_column(String(50))  # triage | surface | advisor
    input_hash: Mapped[str] = mapped_column(String(64))  # sha256 to deduplicate
    result: Mapped[dict] = mapped_column(JSON)
    model_used: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    target = relationship("ScopeTarget", back_populates="ai_insights")


class ScanSession(Base):
    __tablename__ = "scan_sessions"
    __table_args__ = (
        Index("ix_session_target", "target_id"),
        Index("ix_session_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("scope_targets.id", ondelete="CASCADE")
    )
    workflow: Mapped[str] = mapped_column(
        String(20)
    )  # wildcard | domain | company | url
    status: Mapped[str] = mapped_column(
        String(20), default="running"
    )  # running | paused | completed | failed | cancelled
    current_phase: Mapped[Optional[str]] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    stats: Mapped[Optional[dict]] = mapped_column(JSON)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    config_snapshot: Mapped[Optional[dict]] = mapped_column(JSON)

    target = relationship("ScopeTarget", back_populates="sessions")
    artifacts = relationship(
        "ScanArtifact", back_populates="session", cascade="all, delete-orphan"
    )


class ScanArtifact(Base):
    __tablename__ = "scan_artifacts"
    __table_args__ = (Index("ix_artifact_session", "session_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("scan_sessions.id", ondelete="CASCADE")
    )
    phase: Mapped[str] = mapped_column(String(100))
    tool: Mapped[str] = mapped_column(String(100))
    command: Mapped[Optional[str]] = mapped_column(Text)
    stdout: Mapped[Optional[str]] = mapped_column(Text)
    stderr: Mapped[Optional[str]] = mapped_column(Text)
    return_code: Mapped[Optional[int]] = mapped_column(Integer)
    execution_time: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    session = relationship("ScanSession", back_populates="artifacts")


class AIVectorMemory(Base):
    __tablename__ = "ai_vector_memory"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    target_id: Mapped[Optional[int]] = mapped_column(ForeignKey("scope_targets.id", ondelete="CASCADE"))
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("scan_sessions.id", ondelete="CASCADE"))
    memory_type: Mapped[str] = mapped_column(String(50)) # e.g., "finding", "summary", "baseline"
    content: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Vector(1536)) # Assuming OpenAI embeddings
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

# ─── Engine & Session ─────────────────────────────────────────────────────────


class Database:
    def __init__(self, settings: Settings):
        self.settings = settings
        url = settings.db_connection_url()

        if settings.db_type == "sqlite":
            Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)

        self.engine: AsyncEngine = create_async_engine(
            url,
            pool_size=settings.db_pool_size if settings.db_type == "postgresql" else 1,
            max_overflow=settings.db_max_overflow
            if settings.db_type == "postgresql"
            else 0,
            echo=False,
        )
        self.async_session = async_sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def create_all(self):
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_all(self):
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def get_session(self) -> AsyncSession:
        return self.async_session()

    async def close(self):
        await self.engine.dispose()

    async def count(
        self, model, session: Optional[AsyncSession] = None, **filters
    ) -> int:
        if session:
            stmt = select(func.count()).select_from(model)
            for k, v in filters.items():
                col = getattr(model, k)
                stmt = stmt.where(col == v)
            result = await session.execute(stmt)
            return result.scalar() or 0
        async with await self.get_session() as s:
            stmt = select(func.count()).select_from(model)
            for k, v in filters.items():
                col = getattr(model, k)
                stmt = stmt.where(col == v)
            result = await s.execute(stmt)
            return result.scalar() or 0
