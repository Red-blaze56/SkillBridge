"""rename cplusplus to cpp in programming language enum

Revision ID: 5bc047950aea
Revises: a5a32209f344
Create Date: 2026-10-27 17:39:18.018322

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5bc047950aea'
down_revision: Union[str, Sequence[str], None] = 'a5a32209f344'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# SQLAlchemy stores enum member NAMES in Postgres. models.py renamed
# CPLUSPLUS -> CPP, so the database label must follow. Autogenerate can't see a
# rename (it only sees added/removed values), hence this hand-written migration.
# RENAME VALUE keeps existing rows: both `interviews` and `references` use this type.


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE programminglanguageenum RENAME VALUE 'CPLUSPLUS' TO 'CPP'")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TYPE programminglanguageenum RENAME VALUE 'CPP' TO 'CPLUSPLUS'")
