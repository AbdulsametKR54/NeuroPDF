from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from datetime import datetime, timedelta, timezone
import jwt

# <-- DEĞİŞİKLİK: Kendi importlarımızı ve merkezi db'yi kullanıyoruz
from .. import models
from ..config import settings
from ..db import get_db # <-- DEĞİŞİKLİK: Merkezi get_db fonksiyonunu import ediyoruz

router = APIRouter(prefix="/auth", tags=["auth"])

class GoogleExchangeIn(BaseModel):
    id_token: str

class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str | None = None
    username: str | None = None

# <-- DEĞİŞİKLİK: get_db fonksiyonu buradan kaldırıldı, çünkü artık merkezi.

@router.post("/google", response_model=AuthOut)
# <-- DEĞİŞİKLİK: Depends(get_db) artık merkezi fonksiyona işaret ediyor.
def exchange_google_token(payload: GoogleExchangeIn, db: Session = Depends(get_db)):
    # ... fonksiyonun geri kalanı aynı ...
    try:
        info = id_token.verify_oauth2_token(
            payload.id_token, grequests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    sub = info.get("sub")
    email = info.get("email")
    if not sub:
        raise HTTPException(status_code=400, detail="Missing sub")

    user = db.query(models.User).filter(
        models.User.provider == "google",
        models.User.provider_user_id == sub
    ).one_or_none()

    if user is None:
        user = models.User(
            provider="google",
            provider_user_id=sub,
            email=email,
        )
        db.add(user)
    else:
        user.email = email or user.email

    db.commit()
    db.refresh(user)
    
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user.id),
        "email": user.email,
        "username": user.username,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRES_MIN),
        "iat": now,
        "iss": "fastapi",
    }
    token = jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")

    return AuthOut(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
        username=user.username,
    )

# ... set_username fonksiyonu da Depends(get_db) kullanacak şekilde güncellenmeli ...
