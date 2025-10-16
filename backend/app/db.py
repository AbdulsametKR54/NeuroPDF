from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings # <-- DEĞİŞİKLİK: os.getenv yerine merkezi ayar dosyasını kullanıyoruz

# <-- DEĞİŞİKLİK: DATABASE_URL artık doğrudan settings nesnesinden geliyor.
# Bu, .env dosyasından ve Pydantic'in tip kontrollerinden faydalanmamızı sağlar.
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

# <-- DEĞİŞİKLİK: get_db fonksiyonunu buraya taşıyarak merkezileştiriyoruz.
# Artık projedeki tüm router'lar bu fonksiyonu buradan import edecek.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
