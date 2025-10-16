from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas, db # Kendi import yollarınıza göre düzenleyin
from ..redis_client import redis_client

router = APIRouter(prefix="/guest", tags=["guest"])

@router.post("/session", response_model=schemas.GuestSessionOut, status_code=201)
def create_guest_session(database: Session = Depends(db.get_db)):
    """
    Yeni bir misafir oturumu oluşturur ve veritabanına kaydeder.
    Bu endpoint, tarayıcısında guest_id olmayan yeni kullanıcılar için
    frontend tarafından bir kez çağrılır.
    """
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis service is unavailable")

    new_session = models.GuestSession()
    database.add(new_session)
    database.commit()
    database.refresh(new_session)

    # Yeni oturumun kullanım sayısını Redis'e de yazalım.
    # Bu, ilk kullanım kontrolünde veritabanına gitmemizi engeller.
    try:
        redis_key = f"guest:usage:{new_session.id}"
        redis_client.set(redis_key, 0)
    except Exception as e:
        # Redis'e yazılamazsa loglayıp devam edebiliriz, sistem çökmemeli.
        print(f"Could not write initial usage count to Redis for session {new_session.id}: {e}")

    return new_session
