from logging.config import fileConfig
from alembic import context
from sqlalchemy import pool, create_engine
from sqlalchemy.engine import URL
from dotenv import load_dotenv
import os, sys

# =========================
# PATH + ENV LOAD
# =========================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

load_dotenv(os.path.join(BASE_DIR, ".env"))

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# =========================
# FORCE: only split env vars (NO DATABASE_URL)
# =========================
def build_db_url_strict():
    # Use same env var names as app/db.py for consistency
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD")
    host = os.getenv("DB_HOST")
    port = os.getenv("DB_PORT", "5432")
    dbname = os.getenv("DB_NAME", "postgres")
    sslmode = os.getenv("DB_SSLMODE", "require")

    missing = [k for k, v in {
        "DB_USER": user, "DB_PASSWORD": password, "DB_HOST": host, "DB_NAME": dbname
    }.items() if not v]

    if missing:
        raise RuntimeError(f"Missing DB env vars in .env: {missing}. "
                           f"Expected DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME")

    url_obj = URL.create(
        "postgresql+psycopg2",
        username=user,
        password=password,
        host=host,
        port=int(port),
        database=dbname,
        query={"sslmode": sslmode},
    )

    # Debug: print masked URL so we KNOW which user is used (no password leak)
    masked = url_obj.render_as_string(hide_password=True)
    print(f"Alembic using DB URL: {masked}")

    return url_obj

db_url_obj = build_db_url_strict()

# Alembic configparser '%' sevmez → escape
config.set_main_option("sqlalchemy.url", db_url_obj.render_as_string(hide_password=False).replace("%", "%%"))

# =========================
# METADATA
# =========================
from app.models import Base
target_metadata = Base.metadata

# =========================
# MIGRATIONS
# =========================
def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url").replace("%%", "%")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    # engine’i URL objesiyle kur
    connectable = create_engine(
        db_url_obj,
        poolclass=pool.NullPool,
        pool_pre_ping=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
