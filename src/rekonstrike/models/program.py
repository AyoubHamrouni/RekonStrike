from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, ForeignKey, DateTime, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


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


__all__ = [
    "Program", "ProgramScope",
]
