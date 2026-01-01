# app/db.py
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.engine import URL

from supabase import create_client, Client

logger = logging.getLogger(__name__)

# -------------------------------------------------
# Load .env deterministically (avoid uvicorn cwd issues)
# -------------------------------------------------
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"  # backend/.env
load_dotenv(dotenv_path=ENV_PATH, override=False)

Base = declarative_base()

# =================================================
# SUPABASE CLIENT (REST) - optional
# =================================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    # This does NOT affect SQLAlchemy migrations; just REST client.
    logger.warning("SUPABASE_URL or SUPABASE_KEY is missing (REST client disabled).")

def get_supabase() -> Client:
    if supabase is None:
        raise RuntimeError("Supabase client not configured. SUPABASE_URL / SUPABASE_KEY missing.")
    return supabase

# =================================================
# SQLALCHEMY (Postgres)
# =================================================
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_SSLMODE = os.getenv("DB_SSLMODE", "require")

def build_db_url() -> URL:
    missing = [k for k, v in {
        "DB_USER": DB_USER,
        "DB_PASSWORD": DB_PASSWORD,
        "DB_HOST": DB_HOST,
        "DB_NAME": DB_NAME,
    }.items() if not v]

    if missing:
        raise RuntimeError(f"DB config missing: {', '.join(missing)} (check {ENV_PATH})")

    return URL.create(
        "postgresql+psycopg2",
        username=DB_USER,
        password=DB_PASSWORD,  # URL.create handles encoding
        host=DB_HOST,
        port=int(DB_PORT),
        database=DB_NAME,
        query={"sslmode": DB_SSLMODE},
    )

db_url = build_db_url()

logger.info(f"SQLAlchemy DB USER = {DB_USER}")
logger.info(f"SQLAlchemy DB HOST = {DB_HOST}")
logger.info(f"SQLAlchemy DB NAME = {DB_NAME}")

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    pool_recycle=180,  # helps with pooler / idle timeouts
)

# ---- fail fast: test connection at startup (prevents random 500 later)
try:
    with engine.connect() as conn:
        conn.execute(text("select 1"))
    logger.info("DB connection test OK")
except Exception as e:
    logger.error(f"DB connection test FAILED: {repr(e)}", exc_info=True)
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

logger.info(f"ENGINE URL = {engine.url.render_as_string(hide_password=True)}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
