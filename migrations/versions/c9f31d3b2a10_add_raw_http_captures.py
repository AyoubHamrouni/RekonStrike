"""add_raw_http_captures

Revision ID: c9f31d3b2a10
Revises: a1b2c3d4e5f6
Create Date: 2026-05-19 21:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c9f31d3b2a10"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "raw_http_captures",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("program_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("query_string", sa.Text(), nullable=True),
        sa.Column("headers", sa.JSON(), nullable=False),
        sa.Column("body", sa.LargeBinary(), nullable=True),
        sa.Column("body_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("scope_matched", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_raw_http_program_timestamp",
        "raw_http_captures",
        ["program_id", "timestamp"],
        unique=False,
    )
    op.create_index(
        "ix_raw_http_hostname_scope",
        "raw_http_captures",
        ["hostname", "scope_matched"],
        unique=False,
    )
    op.create_index("ix_raw_http_captured_at", "raw_http_captures", ["captured_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_raw_http_captured_at", table_name="raw_http_captures")
    op.drop_index("ix_raw_http_hostname_scope", table_name="raw_http_captures")
    op.drop_index("ix_raw_http_program_timestamp", table_name="raw_http_captures")
    op.drop_table("raw_http_captures")
    op.drop_table("users")
