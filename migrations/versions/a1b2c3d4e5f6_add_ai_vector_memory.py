"""add_ai_vector_memory

Revision ID: a1b2c3d4e5f6
Revises: 7d04610ed1c5
Create Date: 2026-05-18 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision = '7d04610ed1c5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ai_vector_memory',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('memory_type', sa.String(length=50), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('embedding_model', sa.String(length=100), nullable=False, server_default=''),
        sa.Column('metadata_', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('ai_vector_memory')
