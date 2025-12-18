from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# --- Servis ve Task Importları ---
from ..tasks import pdf_tasks
from ..services import ai_service, pdf_service
from ..services.tts_manager import text_to_speech  # TTS Servisi

router = APIRouter(
    prefix="/api/v1/ai",
    tags=["AI Analysis"]
)

# ==========================================
# 1. PDF ÖZETLEME (SENKRON - HIZLI)
# ==========================================
@router.post("/summarize-sync")
async def summarize_synchronous(file: UploadFile = File(...)):
    """
    Misafir kullanıcılar için anlık (Flash model) özetleme.
    """
    try:
        # 1. Dosyayı bellekte oku
        pdf_bytes = await file.read()
        
        # 2. Metni çıkar
        text = pdf_service.extract_text_from_pdf_bytes(pdf_bytes)
        
        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="PDF'ten metin çıkarılamadı veya dosya boş.")

        # 3. Gemini Flash ile özetle
        prompt = (
            "Bu PDF belgesini Türkçe olarak özetle. "
            "Ana konuları ve önemli noktaları madde madde belirt."
        )
        
        # ai_service.py içindeki yeni retry mekanizmalı fonksiyonu kullanıyoruz
        summary = ai_service.gemini_generate(text, prompt, mode="flash")
        
        return {
            "status": "completed", 
            "summary": summary, 
            "method": "synchronous_gemini"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Senkron özetleme hatası: {e}")
        raise HTTPException(status_code=500, detail=f"Özetleme işlemi başarısız: {str(e)}")


# ==========================================
# 2. PDF ÖZETLEME (ASENKRON - CELERY)
# ==========================================
class AsyncTaskRequest(BaseModel):
    pdf_id: int
    storage_path: str
    callback_url: str

@router.post("/summarize-async")
async def summarize_asynchronous(task_request: AsyncTaskRequest):
    """
    Kayıtlı kullanıcılar için arka planda (Celery) çalışan özetleme.
    """
    try:
        pdf_tasks.async_summarize_pdf.delay(
            pdf_id=task_request.pdf_id,
            storage_path=task_request.storage_path,
            callback_url=task_request.callback_url
        )
        
        return {
            "status": "processing",
            "message": "Özetleme görevi arka planda başlatıldı.",
            "pdf_id": task_request.pdf_id,
            "method": "asynchronous"
        }

    except Exception as e:
        print(f"❌ Asenkron görev hatası: {e}")
        raise HTTPException(status_code=500, detail=f"Görev kuyruğa eklenemedi: {str(e)}")


# ==========================================
# 3. PDF İLE SOHBET (CHAT)
# ==========================================
class StartChatResponse(BaseModel):
    session_id: str

@router.post("/chat/start", response_model=StartChatResponse)
async def start_chat(file: UploadFile = File(...)):
    """
    PDF yükler, metni çıkarır ve geçici bir sohbet oturumu başlatır.
    """
    try:
        pdf_bytes = await file.read()
        text = pdf_service.extract_text_from_pdf_bytes(pdf_bytes)

        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="PDF'ten metin çıkarılamadı.")

        # Yeni session oluştur
        session_id = ai_service.create_pdf_chat_session(text, filename=file.filename)
        return {"session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat başlatılamadı: {str(e)}")


class ChatRequest(BaseModel):
    session_id: str
    message: str

@router.post("/chat")
async def chat_about_pdf(req: ChatRequest):
    """
    Başlatılmış bir oturum üzerinden PDF hakkında soru sorar.
    """
    try:
        answer = ai_service.chat_with_pdf(req.session_id, req.message)
        return {"answer": answer}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sohbet hatası: {str(e)}")


# ==========================================
# 4. SESLENDİRME (TTS)
# ==========================================
class TTSRequest(BaseModel):
    text: str

@router.post("/tts")
async def generate_speech(request: TTSRequest):
    """
    Metni MP3 ses dosyasına çevirir ve stream eder.
    """
    if not request.text:
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    try:
        # TTS servisinden ses buffer'ını al
        audio_buffer = text_to_speech(request.text)

        if not audio_buffer:
            raise HTTPException(status_code=500, detail="Ses oluşturulamadı.")

        return StreamingResponse(audio_buffer, media_type="audio/mpeg")
    
    except Exception as e:
        print(f"❌ TTS Hatası: {e}")
        raise HTTPException(status_code=500, detail="Seslendirme servisi hatası.")


# ==========================================
# HEALTH CHECK
# ==========================================
@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ai_service",
        "endpoints": {
            "sync": "/api/v1/ai/summarize-sync",
            "async": "/api/v1/ai/summarize-async",
            "chat_start": "/api/v1/ai/chat/start",
            "chat": "/api/v1/ai/chat",
            "tts": "/api/v1/ai/tts"
        }
    }