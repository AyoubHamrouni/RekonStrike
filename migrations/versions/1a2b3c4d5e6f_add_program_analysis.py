"""Add ProgramAnalysis table

Revision ID: 1a2b3c4d5e6f
Revises: d2e91b7a4c33
Create Date: 2026-05-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a2b3c4d5e6f'
down_revision: Union[str, Sequence[str], None] = 'd2e91b7a4c33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('program_analyses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('program_source', sa.String(length=50), nullable=False),
        sa.Column('program_name', sa.Text(), nullable=False, server_default=''),
        sa.Column('program_slug', sa.String(length=255), nullable=False),
        sa.Column('bounty_min', sa.Integer(), nullable=True),
        sa.Column('bounty_max', sa.Integer(), nullable=True),
        sa.Column('avg_bounty', sa.Integer(), nullable=True),
        sa.Column('response_time_days', sa.Integer(), nullable=True),
        sa.Column('scope_size', sa.Integer(), nullable=True),
        sa.Column('vulnerability_count', sa.Integer(), nullable=True),
        sa.Column('severity_distribution', sa.JSON(), nullable=True),
        sa.Column('risk_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('roi_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('priority_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('analyzed_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'program_source', 'program_slug', name='uq_program_analysis_per_user'),
    )
    op.create_index('ix_program_analysis_user_source', 'program_analyses', ['user_id', 'program_source'])
    op.create_index('ix_program_analysis_priority', 'program_analyses', ['priority_score'])
    op.create_index('ix_program_analysis_analyzed', 'program_analyses', ['analyzed_at'])


def downgrade() -> None:
    op.drop_index('ix_program_analysis_analyzed', table_name='program_analyses')
    op.drop_index('ix_program_analysis_priority', table_name='program_analyses')
    op.drop_index('ix_program_analysis_user_source', table_name='program_analyses')
    op.drop_table('program_analyses')
