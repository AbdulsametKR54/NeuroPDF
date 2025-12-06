from fastapi import APIRouter, UploadFile, File, HTTPException
from ..tasks import pdf_tasks
from ..services import ai_service, pdf_service
from ..services import pdf_service
from ..services.llm_manager import analyze_text_with_ai
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/v1/ai",
    tags=["AI Analysis"]
)

# ==========================================
# MİSAFİR KULLANICI (SENKRON)
# ==========================================

@router.post("/summarize-sync")
async def summarize_synchronous(file: UploadFile = File(...)):
    """
    ✅ Misafir kullanıcılar için ANLIK özetleme.
    
    - Dosyayı bellekte işler
    - Hemen sonuç döner (bekletmez)
    - Veritabanı gerektirmez
    - Guest session limitine tabidir
    """
    try:
        # 1. Dosyayı bellekte oku
        pdf_bytes = await file.read()
        
        # 2. PDF'ten metni çıkar
        text = pdf_service.extract_text_from_pdf_bytes(pdf_bytes)
        
        if not text.strip():
            raise HTTPException(
                status_code=400, 
                detail="PDF'ten metin çıkarılamadı veya dosya boş."
            )

        # 3. Gemini'yi çağır ve özetle
        prompt = (
            "Bu PDF belgesini Türkçe olarak özetle. "
            "Ana konuları ve önemli noktaları madde madde belirt."
        )
        summary = ai_service.call_gemini_sync(text, prompt)
        
        return {
            "status": "completed",
            "summary": summary,
            "method": "synchronous"
        }

    # --- LOCAL LLM Çağrısı ---
    # 3. Gemini yerine local LLM kullan
#        summary_data = analyze_text_with_ai(text)
#
#        return {
#            "status": "completed",
#            "summary": summary_data["summary"],
#            "corrections": summary_data["corrections"],
#            "method": "synchronous"
#        }


    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Senkron özetleme hatası: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Özetleme işlemi başarısız: {str(e)}"
        )


# ==========================================
# KAYITLI KULLANICI (ASENKRON)
# ==========================================

class AsyncTaskRequest(BaseModel):
    pdf_id: int
    storage_path: str  # "/app/uploads/user-uuid/file.pdf"
    callback_url: str  # "http://backend:8000/files/callback/123"


@router.post("/summarize-async")
async def summarize_asynchronous(task_request: AsyncTaskRequest):
    """
    ✅ Kayıtlı kullanıcılar için ASENKRON özetleme.
    
    - Dosyayı diskten okur
    - Arka planda işler (Celery)
    - Sonucu callback ile bildirir
    - Veritabanına kaydeder
    """
    try:
        # Celery'ye görev gönder (anında döner)
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
        print(f"❌ Asenkron görev başlatma hatası: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Görev kuyruğa eklenemedi: {str(e)}"
        )


# ==========================================
# HEALTH CHECK
# ==========================================

@router.get("/health")
def health_check():
    """AI Service sağlık kontrolü"""
    return {
        "status": "healthy",
        "service": "ai_service",
        "endpoints": {
            "sync": "/api/v1/ai/summarize-sync",
            "async": "/api/v1/ai/summarize-async"
        }
    }