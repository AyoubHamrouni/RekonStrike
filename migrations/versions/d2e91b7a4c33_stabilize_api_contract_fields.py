"""stabilize_api_contract_fields

Revision ID: d2e91b7a4c33
Revises: c9f31d3b2a10
Create Date: 2026-05-19 22:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d2e91b7a4c33"
down_revision: Union[str, Sequence[str], None] = "c9f31d3b2a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("live_hosts", sa.Column("raw_url", sa.String(length=1024), nullable=True))
    op.add_column("live_hosts", sa.Column("content_length", sa.Integer(), nullable=True))
    op.add_column("live_hosts", sa.Column("web_server", sa.String(length=255), nullable=True))
    op.add_column("live_hosts", sa.Column("response_headers", sa.JSON(), nullable=True))
    op.add_column("live_hosts", sa.Column("screenshot_path", sa.String(length=512), nullable=True))
    op.add_column("live_hosts", sa.Column("ssl_info", sa.JSON(), nullable=True))
    op.add_column("scan_sessions", sa.Column("current_phase", sa.String(length=100), nullable=True))
    op.add_column("scan_sessions", sa.Column("stats", sa.JSON(), nullable=True))
    op.add_column("vulnerabilities", sa.Column("curl_command", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vulnerabilities", "curl_command")
    op.drop_column("scan_sessions", "stats")
    op.drop_column("scan_sessions", "current_phase")
    op.drop_column("live_hosts", "ssl_info")
    op.drop_column("live_hosts", "screenshot_path")
    op.drop_column("live_hosts", "response_headers")
    op.drop_column("live_hosts", "web_server")
    op.drop_column("live_hosts", "content_length")
    op.drop_column("live_hosts", "raw_url")
