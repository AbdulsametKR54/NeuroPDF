# app/auth.py
from typing import Annotated
from fastapi import HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.config import settings

security = HTTPBearer()

def get_current_user(credentials: Annotated[HTTPAuthorizationCredentials, Security(security)]):
    """
    Bu fonksiyon:
    1. İstekten 'Authorization: Bearer <token>' başlığını otomatik okur.
    2. 'Bearer ' kısmını atar ve ham token'ı alır.
    3. Token'ın süresini ve imzasını doğrular.
    4. Geçerliyse kullanıcı verisini (payload) döndürür.
    """
    token = credentials.credentials

    try:
        # Token'ı çözümle (Decode)
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET, 
            algorithms=["HS256"]
        )
        return payload  # Örn: {'sub': '123', 'email': 'test@example.com', ...}

    except jwt.ExpiredSignatureError:
        # Token'ın süresi dolmuşsa (Exp)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        # Token bozuksa veya imza geçersizse
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )