"""add_ai_insights

Revision ID: 2a3b4c5d6e7f
Revises: 21c8ad6c009f
Create Date: 2026-05-09 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a3b4c5d6e7f'
down_revision: Union[str, Sequence[str], None] = '21c8ad6c009f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('ai_insights',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('target_id', sa.Integer(), nullable=False),
    sa.Column('insight_type', sa.String(length=50), nullable=False),
    sa.Column('input_hash', sa.String(length=64), nullable=False),
    sa.Column('result', sa.JSON(), nullable=False),
    sa.Column('model_used', sa.String(length=100), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('target_id', 'insight_type', 'input_hash', name='uq_ai_insight')
    )
    op.create_index('ix_ai_insight_target', 'ai_insights', ['target_id'], unique=False)
    op.create_index('ix_ai_insight_type', 'ai_insights', ['insight_type'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_ai_insight_type', table_name='ai_insights')
    op.drop_index('ix_ai_insight_target', table_name='ai_insights')
    op.drop_table('ai_insights')
