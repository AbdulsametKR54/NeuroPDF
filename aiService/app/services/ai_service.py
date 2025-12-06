# ai_service/app/services/ai_service.py

import google.generativeai as genai
from fastapi import HTTPException
from ..config import settings # .env dosyasındaki ayarları okumak için

# --- 1. GEMINI API'yi Başlat ---
try:
    genai.configure(api_key=settings.GEMINI_API_KEY)
except Exception as e:
    print(f"HATA: Gemini API yapılandırılamadı: {e}")
    pass

# --- 2. Modelleri Tanımla (DÜZELTİLDİ) ---
# API anahtarınızın desteklediği tam model adlarını kullanıyoruz
flash_model = genai.GenerativeModel('models/gemini-flash-latest')

# 'pro-latest' ile devam edelim, bu en kararlı olanıdır
pro_model = genai.GenerativeModel('models/gemini-pro-latest')


# --- 3. Servis Fonksiyonları ---

def call_gemini_sync(text_content: str, prompt_instruction: str) -> str:
    """
    Kısa metinler için HIZLI (senkron) bir AI çağrısı yapar.
    Misafir kullanıcıların /summarize-sync endpoint'i için idealdir.
    GEMINI FLASH kullanır.
    """
    
    # Metin çok uzunsa, Flash modelinin limitlerini aşmamak için kırp
    MAX_TEXT_LENGTH = 50000 # Örnek bir limit
    if len(text_content) > MAX_TEXT_LENGTH:
        text_content = text_content[:MAX_TEXT_LENGTH]
        
    full_prompt = f"{prompt_instruction}\n\nMETİN:\n---\n{text_content}\n---"
    
    try:
        # API'yi çağır ve yanıtı BEKLE
        response = flash_model.generate_content(full_prompt)
        
        if response.candidates:
            return response.text
        else:
            raise HTTPException(status_code=400, detail="AI'dan geçerli bir yanıt alınamadı. (Belki içerik engellendi)")

    except Exception as e:
        print(f"Gemini Flash Çağrı Hatası: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini servisinde bir hata oluştu: {str(e)}")


def call_gemini_for_task(text_content: str, prompt_instruction: str) -> str:
    """
    ÇOK UZUN metinler için (asenkron) bir AI çağrısı yapar.
    Kayıtlı kullanıcıların Celery görevleri için idealdir.
    GEMINI PRO kullanır.
    """
    
    full_prompt = f"{prompt_instruction}\n\nMETİN:\n---\n{text_content}\n---"
    
    try:
        # API'yi çağır ve yanıtı BEKLE
        response = pro_model.generate_content(full_prompt)
        
        if response.candidates:
            return response.text
        else:
            raise HTTPException(status_code=400, detail="AI'dan geçerli bir yanıt alınamadı. (Belki içerik engellendi)")

    except Exception as e:
        print(f"Gemini Pro Çağrı Hatası: {e}")
        raise Exception(f"Gemini servisinde bir hata oluştu: {str(e)}")

