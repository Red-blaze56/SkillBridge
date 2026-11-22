"""add index for paginated interview list

Revision ID: 1662fc78b074
Revises: 5bc047950aea
Create Date: 2026-10-28 14:27:42.182657

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1662fc78b074'
down_revision: Union[str, Sequence[str], None] = '5bc047950aea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# "This user's interviews, newest first, after this (created_at, id)" is the keyset
# query behind GET /interviews. Postgres reads this b-tree backwards for DESC order.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index('ix_interviews_user_created', 'interviews', ['user_id', 'created_at', 'id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_interviews_user_created', table_name='interviews')
