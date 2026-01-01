# app/services/avatar_service.py

import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional
import io
import base64
import json

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from PIL import Image, ImageDraw, ImageFont

from app.db import get_supabase
from app.models import User, UserAvatar
from app.config import settings
from app.redis_client import redis_client

logger = logging.getLogger(__name__)

BUCKET_NAME = "avatars"
TEMP_AVATAR_TTL = 3600  # 1 saat geçici avatar saklama süresi


def create_storage_path(user_id: str) -> str:
    # örn: 2538.../c9b8...png
    return f"{user_id}/{uuid.uuid4().hex}.png"


async def improve_prompt_with_gemini(user_prompt: str, username: str) -> str:
    """
    Gemini API kullanarak kullanıcının avatar prompt'unu iyileştirir.
    Eğer Gemini API key yoksa orijinal prompt'u döndürür.
    """
    if not settings.GEMINI_API_KEY:
        logger.info("GEMINI_API_KEY not configured, using original prompt")
        return user_prompt
    
    try:
        # Gemini API ile prompt iyileştirme
        import google.generativeai as genai
        
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("models/gemini-flash-latest")
        
        full_prompt = f"Kullanıcı adı: {username}\nKullanıcının avatar açıklaması: {user_prompt}\n\n" \
                     f"Bu açıklamayı basit bir profil avatar'ı için net ve kısa bir açıklamaya dönüştür. " \
                     f"Sadece stil, renk ve genel görünüm özelliklerini belirt. " \
                     f"Yanıt sadece iyileştirilmiş açıklama olmalı, başka metin olmamalı."
        
        response = model.generate_content(full_prompt)
        improved_prompt = response.text.strip() if response.text else user_prompt
        
        logger.info(f"Prompt improved: {user_prompt} -> {improved_prompt}")
        return improved_prompt
    except Exception as e:
        logger.warning(f"Gemini prompt improvement failed: {e}, using original prompt")
        return user_prompt


async def extract_colors_from_prompt(prompt: str, username: str) -> dict:
    """
    Gemini API kullanarak prompt'tan renk bilgisi çıkarır.
    Returns: {"bg_color": (R, G, B) tuple, "text_color": (R, G, B) tuple}
    """
    if not settings.GEMINI_API_KEY:
        # Gemini yoksa default renkleri kullan (isim hash'inden)
        color_seed = hash(username) % 360
        import colorsys
        rgb = colorsys.hsv_to_rgb(color_seed / 360, 0.7, 0.9)
        bg_color = tuple(int(c * 255) for c in rgb)
        text_color = (255, 255, 255) if sum(bg_color) < 400 else (0, 0, 0)
        return {"bg_color": bg_color, "text_color": text_color}
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("models/gemini-flash-latest")
        
        color_prompt = f"Kullanıcı adı: {username}\nAvatar açıklaması: {prompt}\n\n" \
                      f"Bu açıklamaya uygun bir profil avatar'ı için renk önerisi yap. " \
                      f"Sadece JSON formatında yanıt ver, başka metin olmadan: " \
                      f'{{"bg_color": "hex rengi (#RRGGBB formatında)", "text_color": "hex rengi (#RRGGBB formatında)"}}'
        
        response = model.generate_content(color_prompt)
        
        # JSON parse et
        try:
            import json
            import re
            # JSON'u extract et
            json_text = response.text.strip()
            # JSON bloğunu bul
            json_match = re.search(r'\{[^}]+\}', json_text)
            if json_match:
                color_data = json.loads(json_match.group())
                
                # Hex renkleri RGB'ye çevir
                bg_hex = color_data.get("bg_color", "#3498db")
                text_hex = color_data.get("text_color", "#ffffff")
                
                bg_rgb = tuple(int(bg_hex[i:i+2], 16) for i in (1, 3, 5)) if bg_hex.startswith("#") else (52, 152, 219)
                text_rgb = tuple(int(text_hex[i:i+2], 16) for i in (1, 3, 5)) if text_hex.startswith("#") else (255, 255, 255)
                
                logger.info(f"Colors extracted from prompt: bg={bg_rgb}, text={text_rgb}")
                return {"bg_color": bg_rgb, "text_color": text_rgb}
        except Exception as e:
            logger.warning(f"Failed to parse color JSON: {e}")
    
    except Exception as e:
        logger.warning(f"Gemini color extraction failed: {e}")
    
    # Fallback: isim hash'inden renk
    color_seed = hash(username) % 360
    import colorsys
    rgb = colorsys.hsv_to_rgb(color_seed / 360, 0.7, 0.9)
    bg_color = tuple(int(c * 255) for c in rgb)
    text_color = (255, 255, 255) if sum(bg_color) < 400 else (0, 0, 0)
    return {"bg_color": bg_color, "text_color": text_color}


def generate_avatar_from_name(
    name: str, 
    size: int = 200,
    bg_color: Optional[tuple] = None,
    text_color: Optional[tuple] = None,
    style: str = "default"
) -> bytes:
    """
    İsimden basit bir avatar oluşturur.
    İsmin ilk harflerini kullanarak renkli bir daire içinde gösterir.
    
    Args:
        name: Kullanıcı adı
        size: Avatar boyutu (piksel)
        bg_color: Arka plan rengi (RGB tuple)
        text_color: Metin rengi (RGB tuple)
        style: Avatar stili (şimdilik sadece "default" destekleniyor)
    
    Returns:
        PNG formatında avatar bytes
    """
    # İsmi temizle ve baş harfleri al
    name = name.strip() if name else "U"
    name_parts = name.split()
    
    if len(name_parts) >= 2:
        # İki kelime varsa her ikisinin ilk harfi
        initials = (name_parts[0][0] + name_parts[1][0]).upper()[:2]
    else:
        # Tek kelime varsa ilk 2 harf veya tek harf
        initials = name[:2].upper() if len(name) > 1 else name[0].upper()
    
    # Renk seçimi
    if bg_color is None:
        # İsim hash'inden renk üret (tutarlı renkler için)
        color_seed = hash(name) % 360  # HSV hue değeri (0-360)
        import colorsys
        rgb = colorsys.hsv_to_rgb(color_seed / 360, 0.7, 0.9)  # Yüksek doygunluk, açık renk
        bg_color = tuple(int(c * 255) for c in rgb)
    
    # Metin rengi
    if text_color is None:
        text_color = (255, 255, 255) if sum(bg_color) < 400 else (0, 0, 0)
    
    # Yeni görüntü oluştur
    img = Image.new("RGB", (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    
    # Font oluştur (varsayılan font kullan)
    try:
        # Sistem fontunu kullanmaya çalış
        font_size = int(size * 0.4)
        try:
            # Windows için
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            try:
                # Linux için
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            except:
                # macOS için
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        # Font bulunamazsa varsayılan font
        font = ImageFont.load_default()
    
    # Metni ortala
    bbox = draw.textbbox((0, 0), initials, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    position = ((size - text_width) / 2, (size - text_height) / 2 - bbox[1])
    
    # Metni çiz
    draw.text(position, initials, fill=text_color, font=font)
    
    # PNG olarak bytes'a dönüştür
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)
    
    return img_bytes.read()


async def generate_avatar_with_prompt(
    username: str,
    prompt: str,
) -> bytes:
    """
    Prompt'a göre avatar oluşturur (renk bilgisi prompt'tan çıkarılır).
    
    Args:
        username: Kullanıcı adı (initials için)
        prompt: Kullanıcının avatar açıklaması (Gemini ile iyileştirilecek ve renk çıkarılacak)
    
    Returns:
        PNG formatında avatar bytes
    """
    # Prompt'u iyileştir
    improved_prompt = await improve_prompt_with_gemini(prompt, username)
    
    # Prompt'tan renk çıkar
    colors = await extract_colors_from_prompt(improved_prompt, username)
    
    # Avatar oluştur
    avatar_bytes = generate_avatar_from_name(
        username,
        bg_color=colors["bg_color"],
        text_color=colors["text_color"],
        style="default"
    )
    
    return avatar_bytes


def save_temp_avatar(user_id: str, avatar_bytes: bytes, prompt: str) -> str:
    """
    Geçici avatar'ı Redis'e kaydeder (onay bekleyen).
    Returns: temp_avatar_id (UUID)
    """
    temp_avatar_id = str(uuid.uuid4())
    
    if redis_client:
        try:
            # Base64 encode et (Redis'te binary saklamak yerine)
            avatar_base64 = base64.b64encode(avatar_bytes).decode('utf-8')
            
            data = {
                "avatar_bytes_base64": avatar_base64,
                "prompt": prompt,
                "created_at": datetime.utcnow().isoformat()
            }
            
            redis_key = f"temp_avatar:{user_id}:{temp_avatar_id}"
            redis_client.setex(redis_key, TEMP_AVATAR_TTL, json.dumps(data))
            
            logger.info(f"Temp avatar saved: {temp_avatar_id} for user {user_id}")
            return temp_avatar_id
        except Exception as e:
            logger.error(f"Failed to save temp avatar to Redis: {e}")
            # Redis yoksa veya hata varsa, avatar_bytes'ı direkt base64 olarak döndür
            # (frontend'de geçici olarak saklanabilir)
            return temp_avatar_id
    else:
        # Redis yoksa sadece ID döndür, avatar_bytes frontend'de saklanabilir
        logger.warning("Redis not available, temp avatar cannot be stored")
        return temp_avatar_id


def get_temp_avatar(user_id: str, temp_avatar_id: str) -> Optional[bytes]:
    """
    Geçici avatar'ı Redis'ten alır.
    Returns: Avatar bytes veya None
    """
    if not redis_client:
        return None
    
    try:
        redis_key = f"temp_avatar:{user_id}:{temp_avatar_id}"
        data_str = redis_client.get(redis_key)
        
        if not data_str:
            return None
        
        data = json.loads(data_str)
        avatar_base64 = data.get("avatar_bytes_base64")
        
        if not avatar_base64:
            return None
        
        # Base64 decode
        avatar_bytes = base64.b64decode(avatar_base64)
        return avatar_bytes
    except Exception as e:
        logger.error(f"Failed to get temp avatar from Redis: {e}")
        return None


def create_initial_avatar_for_user(db: Session, user_id: str, username: Optional[str] = None) -> UserAvatar:
    """
    Kullanıcı için ilk avatar'ı oluşturur (isimden).
    
    Args:
        db: Database session
        user_id: Kullanıcı ID
        username: Kullanıcı adı (yoksa user tablosundan alınır)
    
    Returns:
        Oluşturulan UserAvatar objesi
    """
    try:
        # Kullanıcıyı al
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Username'i al
        if not username:
            username = user.username or user.email or "User"
        
        # Avatar oluştur
        avatar_bytes = generate_avatar_from_name(username)
        
        # Storage path oluştur
        storage_path = create_storage_path(user_id)
        
        # Supabase Storage'a yükle
        upload_avatar_png_to_storage(storage_path, avatar_bytes)
        
        # DB'ye kaydet
        avatar = save_avatar_record_and_set_active(
            db=db,
            user_id=user_id,
            image_path=storage_path,
            is_ai=True,  # İlk avatar AI ile oluşturulmuş sayılır (otomatik)
        )
        
        logger.info(f"Initial avatar created for user {user_id}")
        return avatar
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating initial avatar: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create initial avatar: {str(e)}")


def upload_avatar_png_to_storage(storage_path: str, file_bytes: bytes):
    """
    Supabase Storage'a PNG upload eder.
    storage_path: "{user_id}/{uuid}.png"
    """
    supabase = get_supabase()

    res = supabase.storage.from_(BUCKET_NAME).upload(
        path=storage_path,
        file=file_bytes,
        file_options={
            "content-type": "image/png",
            "upsert": "true",
        },
    )

    # "Bucket not found" vs hataları buradan yakalayacağız
    if isinstance(res, dict) and res.get("error"):
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {res['error']}")

    return res


def save_avatar_record_and_set_active(
    db: Session,
    user_id: str,
    image_path: str,
    is_ai: bool = False,
) -> UserAvatar:
    """
    - user_avatars tablosuna yeni kayıt ekler
    - users.active_avatar_url'u image_path ile günceller
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        avatar = UserAvatar(
            user_id=user_id,
            image_path=image_path,
            is_ai_generated=is_ai,
        )
        db.add(avatar)

        # Aktif avatarı user tablosunda tutuyoruz
        user.active_avatar_url = image_path

        db.commit()
        db.refresh(avatar)
        return avatar

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Avatar save error")
        raise HTTPException(status_code=500, detail=f"Avatar save error: {str(e)}")


def get_latest_avatar(db: Session, user_id: str) -> Optional[UserAvatar]:
    """
    Kullanıcının en son avatarını döndürür.
    """
    return (
        db.query(UserAvatar)
        .filter(UserAvatar.user_id == user_id)
        .order_by(desc(UserAvatar.created_at))
        .first()
    )
