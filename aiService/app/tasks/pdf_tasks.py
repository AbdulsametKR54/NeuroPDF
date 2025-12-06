import httpx
from ..services import pdf_service, ai_service
from .celery_worker import celery_app
import logging

log = logging.getLogger(__name__)

# --- Asenkron Özetleme Görevi ---

@celery_app.task(bind=True, name="tasks.async_summarize_pdf")
def async_summarize_pdf(self, pdf_id: int, storage_path: str, callback_url: str):
    """
    Bu, bir Celery işçisi (worker) tarafından ARKA PLANDA çalıştırılır.
    Ana FastAPI (ai_service) sunucusunu bloklamaz.
    
    1. Diskteki PDF'i okur.
    2. Gemini 1.5 Pro ile özetler.
    3. Sonucu 'backend_main'e bir webhook/callback ile geri gönderir.
    """
    
    log.info(f"[CELERY TASK] Görev başladı: PDF ID {pdf_id} (Dosya yolu: {storage_path})")
    
    try:
        # 1. PDF'ten Metni Çıkar
        log.info(f"[CELERY TASK] Metin çıkarılıyor...")
        text_content = pdf_service.extract_text_from_pdf_path(storage_path)
        log.info(f"[CELERY TASK] Metin çıkarıldı. (Uzunluk: {len(text_content)} karakter)")

        # 2. Gemini 1.5 Pro'yu Çağır
        prompt_instruction = (
            "Aşağıdaki metni detaylı bir şekilde analiz et. "
            "Metnin ana fikrini, temel argümanlarını ve önemli çıkarımlarını "
            "madde madde özetle."
        )
        log.info(f"[CELERY TASK] Gemini Pro çağrılıyor...")
        summary = ai_service.call_gemini_for_task(text_content, prompt_instruction)
        log.info(f"[CELERY TASK] Özet alındı.")

        # 3. Başarılı Sonucu 'backend_main'e Geri Gönder (Callback)
        success_payload = {
            "status": "completed",
            "summary": summary,
            "pdf_id": pdf_id
        }
        
        log.info(f"[CELERY TASK] Callback gönderiliyor: {callback_url}")
        with httpx.Client() as client:
            response = client.post(callback_url, json=success_payload, timeout=30)
            response.raise_for_status()
            
        log.info(f"[CELERY TASK] Görev başarıyla tamamlandı: PDF ID {pdf_id}")
        return {"status": "success", "summary_length": len(summary)}

    except Exception as e:
        log.error(f"[CELERY TASK] HATA OLUŞTU: PDF ID {pdf_id} | Hata: {str(e)}")
        
        # ✅ DÜZELTME: "error" field'ı kullan, "error_message" değil
        error_payload = {
            "status": "failed",
            "error": str(e),  # ← "error_message" yerine "error"
            "pdf_id": pdf_id
        }
        
        try:
            with httpx.Client() as client:
                client.post(callback_url, json=error_payload, timeout=30)
            log.info(f"[CELERY TASK] Hata callback'i gönderildi.")
        except Exception as callback_error:
            log.error(f"[CELERY TASK] KRİTİK HATA: Hata callback'i gönderilemedi: {callback_error}")

        raise e