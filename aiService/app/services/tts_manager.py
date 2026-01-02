import io
import os
import requests
from dotenv import load_dotenv

# .env dosyasını yükle (API anahtarını oradan okumak için)
load_dotenv()

def text_to_speech(text: str) -> io.BytesIO:
    """
    Metni alır, ElevenLabs API kullanarak sese çevirir
    ve dosyayı diske kaydetmeden bellek (RAM) üzerinden döndürür.
    """
    
    # 1. API Anahtarını al
    api_key = os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key:
        print("HATA: ELEVENLABS_API_KEY bulunamadı.")
        return None

    # 2. Ayarlar
    # Voice ID: ElevenLabs panelinden sevdiğin bir sesin ID'sini alabilirsin.
    # Örnek ID (Rachel): 21m00Tcm4TlvDq8ikWAM
    # Örnek ID (Daha tok bir erkek sesi - Adam): pMsXgVXv3Gez51X66kpL
    VOICE_ID = "21m00Tcm4TlvDq8ikWAM" 
    
    # Türkçe için MUTLAKA 'eleven_multilingual_v2' kullanılmalı
    MODEL_ID = "eleven_multilingual_v2" 

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key
    }

    data = {
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": 0.5,       # Sesin kararlılığı (Daha yüksek = daha monoton)
            "similarity_boost": 0.75 # Sesin orijinal Voice ID'ye benzerliği
        }
    }

    try:
        # 3. İsteği Gönder
        response = requests.post(url, json=data, headers=headers)

        if response.status_code == 200:
            # 4. Gelen ses verisini RAM'e (BytesIO) yaz
            audio_buffer = io.BytesIO(response.content)
            audio_buffer.seek(0) # Okuma imlecini başa al
            return audio_buffer
        else:
            print(f"ElevenLabs API Hatası: {response.status_code} - {response.text}")
            return None

    except Exception as e:
        print(f"TTS Servis Hatası: {e}")
        return None