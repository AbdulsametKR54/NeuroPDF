# app/routers/user_avatar_routes.py

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import base64
import logging

from app.db import get_db
from app.deps import get_current_user
from app.services.avatar_service import (
    create_storage_path,
    upload_avatar_png_to_storage,
    save_avatar_record_and_set_active,
    generate_avatar_from_name,
    create_initial_avatar_for_user,
    generate_avatar_with_prompt,
    get_latest_avatar,
    save_temp_avatar,
    get_temp_avatar,
)

from app.models import UserAvatar
from PIL import Image
import io

router = APIRouter(prefix="/api/v1/user", tags=["User Avatar"])


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
logger = logging.getLogger(__name__)


class GenerateAvatarRequest(BaseModel):
    prompt: str  # Kullanıcının avatar açıklaması (zorunlu)


class AvatarResponse(BaseModel):
    id: int
    image_path: str
    is_ai_generated: bool
    created_at: str


@router.get("/{user_id}/avatar")
async def get_avatar(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Kullanıcının mevcut avatarını döndürür.
    """
    # Kullanıcı sadece kendi avatarını görebilir
    if current_user["sub"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    from app.models import User
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Supabase Storage'dan avatar'ı çek
    from app.db import get_supabase
    supabase = get_supabase()
    
    if not user.active_avatar_url or user.active_avatar_url == "static/defaults/default_avatar.png":
        raise HTTPException(status_code=404, detail="Avatar not found")
    
    try:
        # Storage path'ten avatar'ı al
        avatar_data = supabase.storage.from_("avatars").download(user.active_avatar_url)
        if isinstance(avatar_data, dict) and avatar_data.get("error"):
            raise HTTPException(status_code=404, detail="Avatar not found in storage")
        
        from fastapi.responses import Response
        return Response(content=avatar_data, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve avatar")


@router.get("/{user_id}/avatars")
async def get_avatar_history(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    limit: int = 10,
):
    """
    Kullanıcının avatar geçmişini döndürür.
    """
    # Kullanıcı sadece kendi avatar geçmişini görebilir
    if current_user["sub"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    from app.models import User
    from sqlalchemy import desc
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Avatar geçmişini al
    avatars = (
        db.query(UserAvatar)
        .filter(UserAvatar.user_id == user_id)
        .order_by(desc(UserAvatar.created_at))
        .limit(limit)
        .all()
    )
    
    return [
        AvatarResponse(
            id=avatar.id,
            image_path=avatar.image_path,
            is_ai_generated=avatar.is_ai_generated,
            created_at=avatar.created_at.isoformat() if avatar.created_at else "",
        )
        for avatar in avatars
    ]


@router.post("/{user_id}/avatar")
async def upload_avatar(
    user_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Kullanıcının kendi avatarını yüklemesi.
    """
    # Kullanıcı sadece kendi avatarını güncelleyebilir
    if current_user["sub"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # 1) Content-Type (hızlı filtre)
    if file.content_type != "image/png":
        raise HTTPException(status_code=415, detail="Only PNG files are allowed")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    # 2) PNG magic bytes kontrolü (spoof engeli)
    if not contents.startswith(PNG_MAGIC):
        raise HTTPException(status_code=415, detail="Only PNG files are allowed")

    # 3) Pillow ile doğrulama (bozuk dosya / sahte header yakalama)
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()  # dosyanın bozuk olup olmadığını kontrol eder
        if img.format != "PNG":
            raise HTTPException(status_code=415, detail="Only PNG files are allowed")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # 4) Storage path üret
    storage_path = create_storage_path(user_id)

    # 5) Supabase Storage upload
    try:
        upload_avatar_png_to_storage(storage_path, contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to upload avatar")

    # 6) DB: user_avatars kaydı + users.active_avatar_url güncelle
    try:
        avatar = save_avatar_record_and_set_active(
            db=db,
            user_id=user_id,
            image_path=storage_path,
            is_ai=False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to save avatar")

    return {
        "message": "Avatar uploaded successfully",
        "path": storage_path,
        "avatar_id": avatar.id,
    }


@router.post("/{user_id}/avatar/generate")
async def generate_avatar_preview(
    user_id: str,
    request: GenerateAvatarRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Prompt'a göre avatar önizlemesi oluşturur (henüz kaydetmez).
    Kullanıcı onay verene kadar geçici olarak saklanır.
    """
    # Kullanıcı sadece kendi avatarını güncelleyebilir
    if current_user["sub"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    from app.models import User
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    username = user.username or user.email or "User"
    
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    try:
        # Prompt'a göre avatar oluştur
        avatar_bytes = await generate_avatar_with_prompt(username, request.prompt)
        
        # Geçici olarak Redis'e kaydet (onay bekleyen)
        temp_avatar_id = save_temp_avatar(user_id, avatar_bytes, request.prompt)
        
        # Base64 encode et (frontend'de göstermek için)
        avatar_base64 = base64.b64encode(avatar_bytes).decode('utf-8')
        
        return {
            "message": "Avatar preview generated",
            "temp_avatar_id": temp_avatar_id,
            "preview_image": f"data:image/png;base64,{avatar_base64}",  # Data URL format
            "prompt": request.prompt,
        }
    except Exception as e:
        logger.error(f"Failed to generate avatar preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate avatar: {str(e)}")


@router.post("/{user_id}/avatar/confirm")
async def confirm_avatar(
    user_id: str,
    request: dict = Body(...),  # {"temp_avatar_id": "..."}
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Geçici avatar'ı onaylar ve profil fotoğrafı olarak ayarlar.
    """
    # Kullanıcı sadece kendi avatarını onaylayabilir
    if current_user["sub"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    temp_avatar_id = request.get("temp_avatar_id")
    if not temp_avatar_id:
        raise HTTPException(status_code=400, detail="temp_avatar_id is required")
    
    # Geçici avatar'ı al
    avatar_bytes = get_temp_avatar(user_id, temp_avatar_id)
    if not avatar_bytes:
        raise HTTPException(status_code=404, detail="Temp avatar not found or expired")
    
    try:
        # Storage path oluştur
        storage_path = create_storage_path(user_id)
        
        # Supabase Storage'a yükle
        upload_avatar_png_to_storage(storage_path, avatar_bytes)
        
        # DB'ye kaydet ve aktif yap
        avatar = save_avatar_record_and_set_active(
            db=db,
            user_id=user_id,
            image_path=storage_path,
            is_ai=True,  # AI ile oluşturulmuş
        )
        
        # Redis'ten geçici avatar'ı sil (opsiyonel, TTL zaten var)
        from app.redis_client import redis_client
        if redis_client:
            try:
                redis_key = f"temp_avatar:{user_id}:{temp_avatar_id}"
                redis_client.delete(redis_key)
            except:
                pass  # Silme hatası kritik değil
        
        return {
            "message": "Avatar confirmed and set as profile picture",
            "path": avatar.image_path,
            "avatar_id": avatar.id,
        }
    except Exception as e:
        logger.error(f"Failed to confirm avatar: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to confirm avatar: {str(e)}")
