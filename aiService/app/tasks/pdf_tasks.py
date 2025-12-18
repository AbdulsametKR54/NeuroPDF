import httpx
import logging

from ..services import pdf_service, ai_service
from .celery_worker import celery_app

log = logging.getLogger(__name__)


@celery_app.task(bind=True, name="tasks.async_summarize_pdf")
def async_summarize_pdf(self, pdf_id: int, storage_path: str, callback_url: str):
    """
    1. Diskteki PDF'i okur.
    2. Gemini ile özetler (pro -> flash fallback + retry).
    3. Sonucu callback ile geri gönderir.
    """

    log.info(f"[CELERY TASK] Görev başladı: PDF ID {pdf_id} (Dosya yolu: {storage_path})")

    try:
        # 1) PDF metni
        log.info("[CELERY TASK] Metin çıkarılıyor...")
        text_content = pdf_service.extract_text_from_pdf_path(storage_path)
        log.info(f"[CELERY TASK] Metin çıkarıldı. (Uzunluk: {len(text_content)} karakter)")

        # 2) Özet
        prompt_instruction = (
            "Aşağıdaki metni detaylı bir şekilde analiz et. "
            "Metnin ana fikrini, temel argümanlarını ve önemli çıkarımlarını "
            "madde madde özetle."
        )
        log.info("[CELERY TASK] Gemini çağrılıyor...")
        summary = ai_service.call_gemini_for_task(text_content, prompt_instruction)
        log.info("[CELERY TASK] Özet alındı.")

        # 3) Callback success
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

        error_payload = {
            "status": "failed",
            "error": str(e),
            "pdf_id": pdf_id
        }

        try:
            with httpx.Client() as client:
                client.post(callback_url, json=error_payload, timeout=30)
            log.info("[CELERY TASK] Hata callback'i gönderildi.")
        except Exception as callback_error:
            log.error(f"[CELERY TASK] KRİTİK HATA: Hata callback'i gönderilemedi: {callback_error}")

        raise