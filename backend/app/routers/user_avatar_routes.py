# app/routers/user_avatar_routes.py

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Body, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import base64
import logging
from PIL import Image
import io

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
    edit_avatar_with_prompt,
)

from app.models import UserAvatar

router = APIRouter(prefix="/api/v1/user", tags=["User Avatar"])

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
logger = logging.getLogger(__name__)


# --- REQUEST MODELLERİ ---
class GenerateAvatarRequest(BaseModel):
    prompt: str

class ConfirmAvatarRequest(BaseModel):
    temp_avatar_id: str

class EditAvatarRequest(BaseModel):
    prompt: str

class AvatarResponse(BaseModel):
    id: int
    image_path: str
    is_ai_generated: bool
    created_at: str


# --- YARDIMCI FONKSİYON ---
def resolve_user_id(user_id: str, current_user: dict) -> str:
    """
    Eğer user_id 'me' ise, token'daki sub (user_id) değerini döndürür.
    Değilse ve yetki yoksa 403 fırlatır.
    """
    token_user_id = current_user["sub"]
    
    if user_id == "me":
        return token_user_id
    
    if user_id != token_user_id:
        raise HTTPException(status_code=403, detail="Forbidden: You can only access your own avatar.")
    
    return user_id


# --- ENDPOINTLER ---

@router.get("/{user_id}/avatar")
async def get_avatar(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Kullanıcının aktif avatarını 'users' tablosundaki 'active_avatar_url' alanından çeker.
    """
    # 1. Kullanıcı kimliği doğrulama ('me' kontrolü)
    target_user_id = resolve_user_id(user_id, current_user)
    
    # 2. Users tablosundan kullanıcıyı bul
    from app.models import User
    user = db.query(User).filter(User.id == target_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 3. Aktif avatar yolunu kontrol et
    if not user.active_avatar_url:
        # Varsayılan avatar yoksa 404 döner (Frontend varsayılanı gösterir)
        raise HTTPException(status_code=404, detail="Active avatar not set")

    # 4. Supabase Storage'dan indir
    from app.db import get_supabase
    supabase = get_supabase()
    
    try:
        # Path'i loglayalım (debug için)
        logger.info(f"Downloading active avatar for {target_user_id}: {user.active_avatar_url}")
        
        # 'avatars' bucket'ından dosyayı indir
        avatar_data = supabase.storage.from_("avatars").download(user.active_avatar_url)
        
        # Supabase hata dönerse (dict dönebilir)
        if isinstance(avatar_data, dict) and avatar_data.get("error"):
            logger.error(f"Storage error: {avatar_data}")
            raise HTTPException(status_code=404, detail="Image file not found in storage")
        
        # Başarılıysa resmi dön
        from fastapi.responses import Response
        return Response(content=avatar_data, media_type="image/png")
        
    except Exception as e:
        logger.error(f"Avatar download failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve avatar file")


@router.get("/{user_id}/avatars")
async def get_avatar_history(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    limit: int = 10,
):
    target_user_id = resolve_user_id(user_id, current_user)
    
    from app.models import User
    from sqlalchemy import desc
    
    user = db.query(User).filter(User.id == target_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    avatars = (
        db.query(UserAvatar)
        .filter(UserAvatar.user_id == target_user_id)
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
    # 'me' kontrolü (BURASI HATAYI ÇÖZEN KISIM)
    target_user_id = resolve_user_id(user_id, current_user)
    
    # 1) Content-Type
    if file.content_type != "image/png":
        raise HTTPException(status_code=415, detail="Only PNG files are allowed")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    # 2) Magic bytes
    if not contents.startswith(PNG_MAGIC):
        raise HTTPException(status_code=415, detail="Only PNG files are allowed")

    # 3) Pillow doğrulama
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
        if img.format != "PNG":
            raise HTTPException(status_code=415, detail="Only PNG files are allowed")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # 4) Storage path
    storage_path = create_storage_path(target_user_id)

    # 5) Upload
    try:
        upload_avatar_png_to_storage(storage_path, contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to upload avatar")

    # 6) DB Kayıt
    try:
        avatar = save_avatar_record_and_set_active(
            db=db,
            user_id=target_user_id,
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
    target_user_id = resolve_user_id(user_id, current_user)
    
    from app.models import User
    user = db.query(User).filter(User.id == target_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    username = user.username or user.email or "User"
    
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    try:
        avatar_bytes = await generate_avatar_with_prompt(username, request.prompt)
        
        # Redis'e kaydet
        temp_avatar_id = save_temp_avatar(target_user_id, avatar_bytes, request.prompt)
        
        avatar_base64 = base64.b64encode(avatar_bytes).decode('utf-8')
        
        return {
            "message": "Avatar preview generated",
            "temp_avatar_id": temp_avatar_id,
            "preview_image": f"data:image/png;base64,{avatar_base64}",
            "prompt": request.prompt,
        }
    except Exception as e:
        logger.error(f"Failed to generate avatar preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate avatar: {str(e)}")


@router.post("/{user_id}/avatar/edit")
async def edit_avatar(
    user_id: str,
    file: UploadFile = File(...),
    prompt: str = Form(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    target_user_id = resolve_user_id(user_id, current_user)
    
    from app.models import User
    user = db.query(User).filter(User.id == target_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Dosya kontrolleri
    if file.content_type not in ["image/png", "image/jpeg", "image/jpg"]:
        raise HTTPException(status_code=415, detail="Only PNG/JPEG files are allowed")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")
    
    if not (contents.startswith(PNG_MAGIC) or contents.startswith(JPEG_MAGIC)):
        raise HTTPException(status_code=415, detail="Invalid image file")
    
    # PNG'ye çevir
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
        
        img = Image.open(io.BytesIO(contents))
        if img.format != "PNG":
            png_buffer = io.BytesIO()
            img.convert("RGB").save(png_buffer, format="PNG")
            contents = png_buffer.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    if not prompt or not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    try:
        edited_avatar_bytes = await edit_avatar_with_prompt(contents, prompt)
        temp_avatar_id = save_temp_avatar(target_user_id, edited_avatar_bytes, f"Edited: {prompt}")
        avatar_base64 = base64.b64encode(edited_avatar_bytes).decode('utf-8')
        
        return {
            "message": "Avatar edited successfully",
            "temp_avatar_id": temp_avatar_id,
            "preview_image": f"data:image/png;base64,{avatar_base64}",
            "prompt": prompt,
        }
    except Exception as e:
        logger.error(f"Failed to edit avatar: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to edit avatar: {str(e)}")


@router.post("/{user_id}/avatar/confirm")
async def confirm_avatar(
    user_id: str,
    request: ConfirmAvatarRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    target_user_id = resolve_user_id(user_id, current_user)
    
    temp_avatar_id = request.temp_avatar_id
    if not temp_avatar_id:
        raise HTTPException(status_code=400, detail="temp_avatar_id is required")
    
    avatar_bytes = get_temp_avatar(target_user_id, temp_avatar_id)
    if not avatar_bytes:
        raise HTTPException(status_code=404, detail="Temp avatar not found or expired")
    
    try:
        storage_path = create_storage_path(target_user_id)
        upload_avatar_png_to_storage(storage_path, avatar_bytes)
        
        avatar = save_avatar_record_and_set_active(
            db=db,
            user_id=target_user_id,
            image_path=storage_path,
            is_ai=True,
        )
        
        # Redis temizliği
        from app.redis_client import redis_client
        if redis_client:
            try:
                redis_key = f"temp_avatar:{target_user_id}:{temp_avatar_id}"
                redis_client.delete(redis_key)
            except:
                pass
        
        return {
            "message": "Avatar confirmed",
            "path": avatar.image_path,
            "avatar_id": avatar.id,
        }
    except Exception as e:
        logger.error(f"Failed to confirm avatar: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to confirm avatar: {str(e)}")