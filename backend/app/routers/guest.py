from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import uuid
import logging
from supabase import Client
from ..db import get_supabase
from ..redis_client import redis_client
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/guest", tags=["guest"])

# ==========================================
# MODELS
# ==========================================

class GuestSessionOut(BaseModel):
    guest_id: str
    usage_count: int
    remaining_usage: int
    max_usage: int

class GuestUsageCheck(BaseModel):
    can_use: bool
    usage_count: int
    remaining_usage: int
    message: str

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_guest_usage_count(guest_id: str) -> int:
    """Redis'ten misafir kullanım sayısını al"""
    if redis_client is None:
        return 0
    
    try:
        redis_key = f"guest:usage:{guest_id}"
        count = redis_client.get(redis_key)
        return int(count) if count else 0
    except Exception as e:
        logger.error(f"Redis get error: {e}", exc_info=True)
        return 0

def increment_guest_usage(guest_id: str) -> int:
    """Misafir kullanım sayısını artır"""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis service unavailable")
    
    try:
        redis_key = f"guest:usage:{guest_id}"
        # 24 saat expire time
        count = redis_client.incr(redis_key)
        redis_client.expire(redis_key, 86400)  # 24 hours
        return count
    except Exception as e:
        logger.error(f"Redis incr error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not track usage")

# ==========================================
# ROUTES
# ==========================================

@router.post("/session", response_model=GuestSessionOut, status_code=201)
def create_guest_session():
    """
    Yeni misafir oturumu oluştur.
    Frontend bu endpoint'i çağırıp dönen guest_id'yi localStorage'a kaydeder.
    """
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis service unavailable")
    
    # Yeni guest ID oluştur
    guest_id = str(uuid.uuid4())
    
    # Redis'e ilk kullanım sayısını yaz
    try:
        redis_key = f"guest:usage:{guest_id}"
        redis_client.set(redis_key, 0, ex=86400)  # 24 saat expire
    except Exception as e:
        logger.error(f"Could not initialize guest session in Redis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not create session")
    
    return GuestSessionOut(
        guest_id=guest_id,
        usage_count=0,
        remaining_usage=settings.MAX_GUEST_USAGE,
        max_usage=settings.MAX_GUEST_USAGE
    )

@router.get("/check-usage", response_model=GuestUsageCheck)
def check_guest_usage(
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """
    Misafir kullanıcının kullanım durumunu kontrol et.
    Frontend her işlem öncesi bu endpoint'i çağırır.
    """
    if not x_guest_id:
        raise HTTPException(
            status_code=400, 
            detail="Guest ID required. Please create a session first."
        )
    
    usage_count = get_guest_usage_count(x_guest_id)
    remaining = max(0, settings.MAX_GUEST_USAGE - usage_count)
    can_use = usage_count < settings.MAX_GUEST_USAGE
    
    if not can_use:
        message = "Usage limit reached. Please sign in to continue."
    elif remaining == 1:
        message = f"You have {remaining} use remaining."
    else:
        message = f"You have {remaining} uses remaining."
    
    return GuestUsageCheck(
        can_use=can_use,
        usage_count=usage_count,
        remaining_usage=remaining,
        message=message
    )

@router.post("/use", response_model=GuestUsageCheck)
def use_guest_service(
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """
    Misafir kullanıcı bir işlem yaptığında bu endpoint çağrılır.
    Kullanım sayısını artırır ve yeni durumu döndürür.
    """
    if not x_guest_id:
        raise HTTPException(
            status_code=400,
            detail="Guest ID required"
        )
    
    # Önce mevcut kullanımı kontrol et
    current_usage = get_guest_usage_count(x_guest_id)
    
    if current_usage >= settings.MAX_GUEST_USAGE:
        raise HTTPException(
            status_code=403,
            detail="Usage limit reached. Please sign in to continue."
        )
    
    # Kullanımı artır
    new_usage = increment_guest_usage(x_guest_id)
    remaining = max(0, settings.MAX_GUEST_USAGE - new_usage)
    can_use = new_usage < settings.MAX_GUEST_USAGE
    
    if not can_use:
        message = "This was your last use. Please sign in to continue."
    elif remaining == 1:
        message = f"You have {remaining} use remaining."
    else:
        message = f"You have {remaining} uses remaining."
    
    return GuestUsageCheck(
        can_use=can_use,
        usage_count=new_usage,
        remaining_usage=remaining,
        message=message
    )

@router.delete("/session")
def delete_guest_session(
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """
    Misafir oturumunu sil (kullanıcı giriş yaptığında)
    """
    if not x_guest_id:
        return {"message": "No session to delete"}
    
    if redis_client:
        try:
            redis_key = f"guest:usage:{x_guest_id}"
            redis_client.delete(redis_key)
        except Exception as e:
            logger.error(f"Could not delete guest session: {e}", exc_info=True)
    
    return {"message": "Session deleted"}