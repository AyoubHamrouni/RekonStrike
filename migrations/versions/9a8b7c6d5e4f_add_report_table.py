"""Add Report table

Revision ID: 9a8b7c6d5e4f
Revises: 1a2b3c4d5e6f
Create Date: 2026-05-21 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9a8b7c6d5e4f'
down_revision: Union[str, Sequence[str], None] = '1a2b3c4d5e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('testing_session_id', sa.Integer(), nullable=False),
        sa.Column('format', sa.String(length=20), nullable=False, server_default='markdown'),
        sa.Column('title', sa.Text(), nullable=False, server_default=''),
        sa.Column('executive_summary', sa.Text(), nullable=False, server_default=''),
        sa.Column('severity_breakdown', sa.JSON(), nullable=True),
        sa.Column('findings_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('generated_at', sa.DateTime(), nullable=False),
        sa.Column('exported_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['testing_session_id'], ['testing_sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_report_target_generated', 'reports', ['target_id', 'generated_at'])
    op.create_index('ix_report_user_generated', 'reports', ['user_id', 'generated_at'])


def downgrade() -> None:
    op.drop_index('ix_report_user_generated', table_name='reports')
    op.drop_index('ix_report_target_generated', table_name='reports')
    op.drop_table('reports')
