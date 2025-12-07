from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from supabase import create_client, Client
from dotenv import load_dotenv
import os
from urllib.parse import quote_plus

load_dotenv()

# Supabase Client (API operasyonları için)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# SQLAlchemy (ORM ve Migration için - opsiyonel)
USER = os.getenv("user")
PASSWORD = os.getenv("password")
HOST = os.getenv("host")
PORT = os.getenv("port", "5432")
DBNAME = os.getenv("dbname")

# SQLAlchemy engine (sadece migration veya ORM kullanacaksanız)
engine = None
SessionLocal = None
Base = declarative_base()

if all([USER, PASSWORD, HOST, DBNAME]):
    try:
        encoded_password = quote_plus(PASSWORD)
        DATABASE_URL = f"postgresql+psycopg2://{USER}:{encoded_password}@{HOST}:{PORT}/{DBNAME}?sslmode=require"
        
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 10}
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    except Exception as e:
        print(f"Warning: SQLAlchemy engine could not be created: {e}")
        print("Using Supabase client only...")

def get_db():
    """SQLAlchemy session dependency (if engine is available)"""
    if SessionLocal is None:
        raise RuntimeError("SQLAlchemy is not configured. Use Supabase client instead.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_supabase() -> Client:
    """Supabase client dependency"""
    return supabase