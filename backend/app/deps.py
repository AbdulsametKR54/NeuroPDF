from fastapi import Header, HTTPException
import jwt
from .config import settings

def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload  # sub, email, username...
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
