"""add_fp_score_to_vulnerabilities

Revision ID: 3b4c5d6e7f8a
Revises: 2a3b4c5d6e7f
Create Date: 2026-05-09 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3b4c5d6e7f8a'
down_revision: Union[str, Sequence[str], None] = '2a3b4c5d6e7f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('vulnerabilities', sa.Column('fp_score', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('vulnerabilities', 'fp_score')
