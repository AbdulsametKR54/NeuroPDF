from gtts import gTTS
import io

def text_to_speech(text: str) -> io.BytesIO:
    """
    Metni alır, Google TTS kullanarak sese çevirir
    ve dosyayı diske kaydetmeden bellek (RAM) üzerinden döndürür.
    """
    try:
        # lang='tr' ile Türkçe seslendirme yapıyoruz
        tts = gTTS(text=text, lang='tr', slow=False)
        
        # BytesIO nesnesi oluştur (RAM'de dosya gibi davranır)
        buffer = io.BytesIO()
        
        # Sesi bu buffer'a yaz
        tts.write_to_fp(buffer)
        
        # İmleci başa al (yoksa okuma yapıldığında boş gelir)
        buffer.seek(0)
        
        return buffer
    except Exception as e:
        print(f"TTS Servis Hatası: {e}")
        return None