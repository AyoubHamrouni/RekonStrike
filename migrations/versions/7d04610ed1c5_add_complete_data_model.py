"""Add complete data model

Revision ID: 7d04610ed1c5
Revises: b48e6584963e
Create Date: 2026-05-10 14:04:39.841817

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d04610ed1c5'
down_revision: Union[str, Sequence[str], None] = 'b48e6584963e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New tables (no rows yet — safe to create before renaming)
    op.create_table('programs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scope_target_id', sa.Integer(), nullable=False),
        sa.Column('platform', sa.String(length=50), nullable=False),
        sa.Column('program_handle', sa.String(length=255), nullable=False),
        sa.Column('program_name', sa.String(length=255), nullable=False),
        sa.Column('bounty_min', sa.Integer(), nullable=True),
        sa.Column('bounty_max', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(length=10), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['scope_target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('program_scopes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('program_id', sa.Integer(), nullable=False),
        sa.Column('in_scope', sa.JSON(), nullable=False),
        sa.Column('out_of_scope', sa.JSON(), nullable=False),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('dns_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('subdomain', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('value', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('secret_findings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('source_url', sa.String(length=1024), nullable=False),
        sa.Column('detector_name', sa.String(length=100), nullable=False),
        sa.Column('raw_secret', sa.Text(), nullable=True),
        sa.Column('redacted', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('takeover_findings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('subdomain', sa.String(length=255), nullable=False),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('scan_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('program_id', sa.Integer(), nullable=True),
        sa.Column('workflow', sa.String(length=50), nullable=False),
        sa.Column('config_snapshot', sa.JSON(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('step_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('scan_artifacts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scan_session_id', sa.Integer(), nullable=False),
        sa.Column('artifact_type', sa.String(length=50), nullable=False),
        sa.Column('path', sa.String(length=512), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['scan_session_id'], ['scan_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('vulnerabilities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('scan_session_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('severity', sa.String(length=50), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('template_id', sa.String(length=255), nullable=True),
        sa.Column('matched_at', sa.String(length=1024), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('proof_of_concept', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['scan_session_id'], ['scan_sessions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('ai_insights',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('insight_type', sa.String(length=50), nullable=False),
        sa.Column('input_hash', sa.String(length=64), nullable=False),
        sa.Column('result', sa.JSON(), nullable=False),
        sa.Column('model_used', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('endpoints',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('live_host_id', sa.Integer(), nullable=True),
        sa.Column('url', sa.String(length=1024), nullable=False),
        sa.Column('content_type', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['live_host_id'], ['live_hosts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_id'], ['scope_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('finding_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vulnerability_id', sa.Integer(), nullable=False),
        sa.Column('platform', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('steps_to_reproduce', sa.Text(), nullable=False),
        sa.Column('impact', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['vulnerability_id'], ['vulnerabilities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # ── Column renames (preserve data) ────────────────────────────────────
    op.alter_column('scope_targets', 'domain', new_column_name='target')
    op.alter_column('subdomains', 'name', new_column_name='subdomain')

    # ── New columns on existing tables ────────────────────────────────────
    op.add_column('scope_targets', sa.Column('target_type', sa.String(length=50),
                  nullable=False, server_default='wildcard'))
    op.add_column('subdomains', sa.Column('source', sa.String(length=100),
                  nullable=False, server_default='passive'))
    op.add_column('subdomains', sa.Column('cname', sa.String(length=255), nullable=True))
    op.add_column('subdomains', sa.Column('ip_addresses', sa.JSON(), nullable=True))
    op.add_column('live_hosts', sa.Column('subdomain_id', sa.Integer(), nullable=True))
    op.add_column('live_hosts', sa.Column('title', sa.String(length=255), nullable=True))
    op.add_column('live_hosts', sa.Column('technologies', sa.JSON(), nullable=True))
    op.add_column('live_hosts', sa.Column('response_time_ms', sa.Integer(), nullable=True))
    op.add_column('live_hosts', sa.Column('waf_detected', sa.JSON(), nullable=True))
    op.add_column('live_hosts', sa.Column('roi_score', sa.Integer(),
                  nullable=False, server_default='0'))

    # ── Batch operations for constraints on existing tables (SQLite compat) ──
    with op.batch_alter_table('scope_targets') as batch_op:
        batch_op.create_unique_constraint('uq_scope_target_target', ['target'])

    with op.batch_alter_table('subdomains') as batch_op:
        batch_op.create_unique_constraint('uq_subdomain_per_target',
                                          ['target_id', 'subdomain'])

    with op.batch_alter_table('live_hosts') as batch_op:
        batch_op.create_unique_constraint('uq_live_host_url', ['url'])
        batch_op.create_foreign_key(
            'fk_live_host_subdomain', 'subdomains',
            ['subdomain_id'], ['id'], ondelete='SET NULL'
        )


def downgrade() -> None:
    # Reverse FK and unique constraints on existing tables (batch mode)
    with op.batch_alter_table('live_hosts') as batch_op:
        batch_op.drop_constraint('fk_live_host_subdomain', type_='foreignkey')
        batch_op.drop_constraint('uq_live_host_url', type_='unique')

    with op.batch_alter_table('subdomains') as batch_op:
        batch_op.drop_constraint('uq_subdomain_per_target', type_='unique')

    with op.batch_alter_table('scope_targets') as batch_op:
        batch_op.drop_constraint('uq_scope_target_target', type_='unique')

    # Reverse new columns on existing tables
    op.drop_column('live_hosts', 'roi_score')
    op.drop_column('live_hosts', 'waf_detected')
    op.drop_column('live_hosts', 'response_time_ms')
    op.drop_column('live_hosts', 'technologies')
    op.drop_column('live_hosts', 'title')
    op.drop_column('live_hosts', 'subdomain_id')
    op.drop_column('subdomains', 'ip_addresses')
    op.drop_column('subdomains', 'cname')
    op.drop_column('subdomains', 'source')
    op.drop_column('scope_targets', 'target_type')

    # Reverse column renames (preserve data)
    op.alter_column('subdomains', 'subdomain', new_column_name='name')
    op.alter_column('scope_targets', 'target', new_column_name='domain')

    # Drop new tables (reverse order to respect FKs)
    op.drop_table('finding_reports')
    op.drop_table('vulnerabilities')
    op.drop_table('endpoints')
    op.drop_table('ai_insights')
    op.drop_table('scan_artifacts')
    op.drop_table('scan_sessions')
    op.drop_table('takeover_findings')
    op.drop_table('secret_findings')
    op.drop_table('dns_records')
    op.drop_table('program_scopes')
    op.drop_table('programs')
