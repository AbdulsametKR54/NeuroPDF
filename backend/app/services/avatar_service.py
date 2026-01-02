# app/services/avatar_service.py

import logging
import uuid
import io
import base64
import json
import requests  # HTTP isteği için gerekli
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from PIL import Image, ImageDraw, ImageFont

# Google AI
import google.generativeai as genai

from app.db import get_supabase
from app.models import User, UserAvatar
from app.config import settings
from app.redis_client import redis_client

logger = logging.getLogger(__name__)

BUCKET_NAME = "avatars"
TEMP_AVATAR_TTL = 3600

# API Key Konfigürasyonu
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

MODEL_TEXT = "models/gemini-1.5-flash"

def create_storage_path(user_id: str) -> str:
    return f"{user_id}/{uuid.uuid4().hex}.png"

# ==========================================
# 1. GOOGLE IMAGEN (REST API İLE)
# ==========================================
async def generate_image_google(prompt: str) -> Optional[bytes]:
    """
    Google Imagen modelini SDK yerine direkt REST API ile çağırır.
    PAYLOAD FORMATI DÜZELTİLDİ: 'instances' ve 'parameters' yapısı eklendi.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("Gemini API Key eksik!")
        return None

    # URL: 'image-generation-001' modeli (Imagen 2 tabanlı, genelde erişimi açıktır)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/image-generation-001:predict?key={settings.GEMINI_API_KEY}"
    
    headers = {"Content-Type": "application/json"}
    
    # ✅ DÜZELTME: Google API'nin kabul ettiği DOĞRU veri yapısı
    payload = {
        "instances": [
            {
                "prompt": prompt
            }
        ],
        "parameters": {
            "sampleCount": 1,
            # aspect ratio parametresi bazı modellerde desteklenmeyebilir, 
            # hata almamak için şimdilik sade tutuyoruz.
        }
    }

    try:
        logger.info(f"Sending request to Google Imagen API: {prompt}")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        # Hata kontrolü
        if response.status_code != 200:
            logger.error(f"Google API Error ({response.status_code}): {response.text}")
            return None

        result = response.json()
        
        # Yanıtı çözümle (Yapı: predictions -> [ { bytesBase64Encoded: "..." } ])
        if "predictions" in result and len(result["predictions"]) > 0:
            prediction = result["predictions"][0]
            
            # Base64 verisini al
            if "bytesBase64Encoded" in prediction:
                b64_image = prediction["bytesBase64Encoded"]
                return base64.b64decode(b64_image)
            # Bazen direkt string olarak gelebilir
            elif isinstance(prediction, str):
                return base64.b64decode(prediction)
                
        logger.warning(f"Google boş veya bilinmeyen formatta yanıt döndü: {result}")
        return None

    except Exception as e:
        logger.error(f"Google Image REST Request Failed: {e}")
        return None

# ==========================================
# 2. GEMINI VISION (RESİM ANALİZİ)
# ==========================================
async def analyze_and_rewrite_prompt(image_bytes: bytes, user_prompt: str) -> str:
    """
    Gemini 1.5 Flash'a resmi gösterip yeni bir prompt yazdırır.
    """
    try:
        model = genai.GenerativeModel(MODEL_TEXT)
        img = Image.open(io.BytesIO(image_bytes))
        
        prompt_instruction = f"""
        Bu resme bak ve kullanıcının şu isteğini uygula: "{user_prompt}".
        Görevin: Bu resmin görsel stilini koruyarak, kullanıcının istediği değişikliği içeren 
        YENİ bir resim çizdirmek için Google Imagen modeline verilecek İngilizce prompt'u yazmak.
        Sadece prompt'u yaz.
        """
        
        response = model.generate_content([prompt_instruction, img])
        return response.text.strip()
    except Exception as e:
        logger.error(f"Vision Analysis Failed: {e}")
        return user_prompt

async def improve_text_prompt(user_prompt: str) -> str:
    """
    Gemini ile metin promptunu geliştirir.
    """
    try:
        model = genai.GenerativeModel(MODEL_TEXT)
        prompt = f"Convert this user request into a high-quality, detailed English image generation prompt for AI: '{user_prompt}'. Output ONLY the prompt."
        response = model.generate_content(prompt)
        return response.text.strip()
    except:
        return user_prompt

# ==========================================
# ANA SERVİS FONKSİYONLARI
# ==========================================

async def generate_avatar_with_prompt(username: str, prompt: str) -> bytes:
    # 1. Prompt'u iyileştir
    improved_prompt = await improve_text_prompt(prompt)
    
    # 2. Resmi Google API ile üret
    image_bytes = await generate_image_google(improved_prompt)
    
    if image_bytes:
        return image_bytes
    
    # 3. Hata olursa Fallback (Harf Avatarı)
    logger.warning("Google API resim üretemedi, fallback kullanılıyor.")
    return generate_avatar_from_name(username, bg_color=(50, 50, 50))

async def edit_avatar_with_prompt(image_bytes: bytes, prompt: str) -> bytes:
    # 1. Yeni Prompt Oluştur
    new_prompt = await analyze_and_rewrite_prompt(image_bytes, prompt)
    
    # 2. Yeni Resim Üret
    edited_bytes = await generate_image_google(new_prompt)
    
    if edited_bytes:
        return edited_bytes
        
    return image_bytes

# ==========================================
# YARDIMCI FONKSİYONLAR (DEĞİŞMEDİ)
# ==========================================

def generate_avatar_from_name(name: str, size: int = 512, bg_color=None, text_color=None, style="default") -> bytes:
    name = name.strip() if name else "U"
    initials = name[:2].upper()
    
    if bg_color is None:
        color_seed = hash(name) % 360
        import colorsys
        rgb = colorsys.hsv_to_rgb(color_seed / 360, 0.7, 0.9)
        bg_color = tuple(int(c * 255) for c in rgb)
    
    if text_color is None:
        text_color = (255, 255, 255) if sum(bg_color) < 400 else (0, 0, 0)
    
    img = Image.new("RGB", (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    
    try:
        font_size = int(size * 0.4)
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    draw.text((size/2, size/2), initials, fill=text_color, font=font, anchor="mm")
    
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)
    return img_bytes.read()

def save_temp_avatar(user_id: str, avatar_bytes: bytes, prompt: str) -> str:
    temp_avatar_id = str(uuid.uuid4())
    if redis_client:
        try:
            avatar_base64 = base64.b64encode(avatar_bytes).decode('utf-8')
            data = {"avatar_bytes_base64": avatar_base64, "prompt": prompt, "created_at": datetime.utcnow().isoformat()}
            redis_key = f"temp_avatar:{user_id}:{temp_avatar_id}"
            redis_client.setex(redis_key, TEMP_AVATAR_TTL, json.dumps(data))
            return temp_avatar_id
        except Exception as e:
            logger.error(f"Redis error: {e}")
    return temp_avatar_id

def get_temp_avatar(user_id: str, temp_avatar_id: str) -> Optional[bytes]:
    if not redis_client: return None
    try:
        data_str = redis_client.get(f"temp_avatar:{user_id}:{temp_avatar_id}")
        if not data_str: return None
        data = json.loads(data_str)
        return base64.b64decode(data.get("avatar_bytes_base64"))
    except: return None

def create_initial_avatar_for_user(db: Session, user_id: str, username: Optional[str] = None) -> UserAvatar:
    # (Bu fonksiyon aynı kalabilir, sadece import hatası olmasın diye buraya koydum)
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user: raise HTTPException(status_code=404)
        if not username: username = user.username or user.email or "User"
        avatar_bytes = generate_avatar_from_name(username)
        storage_path = create_storage_path(user_id)
        upload_avatar_png_to_storage(storage_path, avatar_bytes)
        avatar = save_avatar_record_and_set_active(db, user_id, storage_path, is_ai=True)
        return avatar
    except:
        return None

def upload_avatar_png_to_storage(storage_path: str, file_bytes: bytes):
    supabase = get_supabase()
    res = supabase.storage.from_(BUCKET_NAME).upload(path=storage_path, file=file_bytes, file_options={"content-type": "image/png", "upsert": "true"})
    if isinstance(res, dict) and res.get("error"): raise HTTPException(status_code=500, detail=f"Storage error: {res['error']}")
    return res

def save_avatar_record_and_set_active(db: Session, user_id: str, image_path: str, is_ai: bool = False) -> UserAvatar:
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(status_code=404)
    avatar = UserAvatar(user_id=user_id, image_path=image_path, is_ai_generated=is_ai)
    db.add(avatar)
    user.active_avatar_url = image_path
    db.commit()
    db.refresh(avatar)
    return avatar

def get_latest_avatar(db: Session, user_id: str) -> Optional[UserAvatar]:
    return db.query(UserAvatar).filter(UserAvatar.user_id == user_id).order_by(desc(UserAvatar.created_at)).first()

# Gerekli olmayan eski importlar için boş fonksiyonlar (import hatası almamak için)
async def improve_prompt_with_gemini(p, u): return p
async def extract_colors_from_prompt(p, u): return {}