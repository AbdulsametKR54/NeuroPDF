# aiService/app/deps.py
from fastapi import Header, HTTPException, Security
from fastapi.security import APIKeyHeader
from .config import settings

# API Key Header
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(x_api_key: str = Security(API_KEY_HEADER)):
    """
    API Key doğrulama dependency.
    Backend service'ten gelen istekleri doğrular.
    """
    if not settings.AI_SERVICE_API_KEY:
        # API key yapılandırılmamışsa (development), herhangi bir key kabul et
        return True
    
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="API key is required. Please provide X-API-Key header."
        )
    
    if x_api_key != settings.AI_SERVICE_API_KEY:
        raise HTTPException(
            status_code=403,
            detail="Invalid API key"
        )
    
    return True