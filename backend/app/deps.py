from fastapi import Header, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from .config import settings

# HTTPBearer for Swagger UI integration
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    JWT token'ı doğrular ve kullanıcı bilgilerini döndürür.
    Swagger UI'da authorization için kullanılır.
    FastAPI dependency injection ile kullanıldığında Security(security) ile çağrılır.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload  # sub, email, username...
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user_from_header(authorization: str | None = Header(default=None)):
    """
    Header'dan authorization alan alternatif fonksiyon.
    Bazı endpoint'lerde manuel header kontrolü için kullanılabilir.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload  # sub, email, username...
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
