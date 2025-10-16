"""remove created_at and last_login_at from users

Revision ID: e1abc1f14621
Revises: 38d2ffe6afe4
Create Date: 2025-10-13 19:19:12.168547

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1abc1f14621'
down_revision: Union[str, None] = '38d2ffe6afe4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("created_at")
        batch_op.drop_column("last_login_at")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("created_at", sa.TIMESTAMP(timezone=True)))
        batch_op.add_column(sa.Column("last_login_at", sa.TIMESTAMP(timezone=True)))
