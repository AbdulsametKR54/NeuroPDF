from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os, sys

# ---- Proje kökünü (backend/) PYTHONPATH'e ekle ----
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../backend
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Alembic Config nesnesi
config = context.config

# logging config (alembic.ini içindeki logger bölümleri için)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Modelleri bağla
from app.models import Base
target_metadata = Base.metadata

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
