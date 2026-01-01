"""add llm choice and user role tables

Revision ID: f7a8b9c0d1e2
Revises: 0dbd5915a0b1
Create Date: 2025-01-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = '0dbd5915a0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create llm_choices table
    op.create_table(
        'llm_choices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Insert default values: 0="local llm", 1="cloud llm"
    op.execute("INSERT INTO llm_choices (id, name) VALUES (0, 'local llm')")
    op.execute("INSERT INTO llm_choices (id, name) VALUES (1, 'cloud llm')")
    
    # Create user_roles table
    op.create_table(
        'user_roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Insert default values: 0="default user", 1="pro user", 2="admin"
    op.execute("INSERT INTO user_roles (id, name) VALUES (0, 'default user')")
    op.execute("INSERT INTO user_roles (id, name) VALUES (1, 'pro user')")
    op.execute("INSERT INTO user_roles (id, name) VALUES (2, 'admin')")
    
    # Add foreign key columns to users table
    op.add_column('users', sa.Column('llm_choice_id', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.add_column('users', sa.Column('role_id', sa.Integer(), nullable=False, server_default=sa.text('0')))
    
    # Create foreign key constraints
    op.create_foreign_key(
        'fk_users_llm_choice',
        'users', 'llm_choices',
        ['llm_choice_id'], ['id'],
        ondelete='RESTRICT'
    )
    op.create_foreign_key(
        'fk_users_role',
        'users', 'user_roles',
        ['role_id'], ['id'],
        ondelete='RESTRICT'
    )


def downgrade() -> None:
    # Drop foreign key constraints
    op.drop_constraint('fk_users_role', 'users', type_='foreignkey')
    op.drop_constraint('fk_users_llm_choice', 'users', type_='foreignkey')
    
    # Drop columns from users table
    op.drop_column('users', 'role_id')
    op.drop_column('users', 'llm_choice_id')
    
    # Drop tables
    op.drop_table('user_roles')
    op.drop_table('llm_choices')

