"""interviews belong to SkillBridge users; drop this service's own users

Revision ID: 7f3c9a2d1e4b
Revises: 1662fc78b074
Create Date: 2026-11-23 00:30:00

SkillBridge's API now signs students in and calls this service with the student's
SkillBridge user id, so interviews.user_id becomes that id (text) and the service's
own users and refresh_tokens tables go away.

One-way: the old UUID user ids can't be matched to SkillBridge users, so there is
no downgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7f3c9a2d1e4b'
down_revision: Union[str, Sequence[str], None] = '1662fc78b074'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('interviews_user_id_fkey', 'interviews', type_='foreignkey')
    op.alter_column(
        'interviews', 'user_id',
        type_=sa.String(length=64),
        existing_type=sa.Uuid(),
        existing_nullable=False,
        postgresql_using='user_id::text',
    )

    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')

    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.execute('DROP TYPE IF EXISTS roleenum')


def downgrade() -> None:
    raise RuntimeError("7f3c9a2d1e4b is one-way: SkillBridge user ids can't be turned back into the old users table.")
