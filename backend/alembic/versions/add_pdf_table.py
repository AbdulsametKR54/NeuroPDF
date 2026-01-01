"""add pdf table

Revision ID: a3b4c5d6e7f8
Revises: f7a8b9c0d1e2
Create Date: 2025-01-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create pdfs table
    op.create_table(
        'pdfs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('pdf_data', sa.LargeBinary(), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create index on user_id for faster queries
    op.create_index(op.f('ix_pdfs_user_id'), 'pdfs', ['user_id'], unique=False)


def downgrade() -> None:
    # Drop index
    op.drop_index(op.f('ix_pdfs_user_id'), table_name='pdfs')
    
    # Drop table
    op.drop_table('pdfs')


