# app/rate_limit.py
"""Simple rate limiting middleware using Redis"""
import time
from typing import Optional
from fastapi import Request, HTTPException, status
from .redis_client import redis_client
from .config import settings

def check_rate_limit(request: Request, key: str, limit: int, window: int = 60) -> bool:
    """
    Rate limit kontrolü yapar.
    Returns: True if allowed, False if rate limit exceeded
    """
    if not settings.RATE_LIMIT_ENABLED or redis_client is None:
        return True  # Rate limiting kapalıysa veya Redis yoksa izin ver
    
    try:
        # IP adresini al
        client_ip = request.client.host if request.client else "unknown"
        redis_key = f"ratelimit:{key}:{client_ip}"
        
        # Mevcut sayıyı al
        current = redis_client.get(redis_key)
        
        if current is None:
            # İlk istek, sayacı başlat
            redis_client.setex(redis_key, window, 1)
            return True
        else:
            current_count = int(current)
            if current_count >= limit:
                # Rate limit aşıldı
                return False
            else:
                # Sayacı artır
                redis_client.incr(redis_key)
                return True
    except Exception as e:
        # Redis hatası durumunda izin ver (fail-open)
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Rate limit check failed: {e}")
        return True