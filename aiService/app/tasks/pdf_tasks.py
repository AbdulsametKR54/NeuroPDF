import httpx
import logging

from ..services import pdf_service
from ..services.llm_manager import summarize_text
from .celery_worker import celery_app

log = logging.getLogger(__name__)

@celery_app.task(bind=True, name="tasks.async_summarize_pdf")
def async_summarize_pdf(self, pdf_id: int, storage_path: str, callback_url: str, llm_provider: str = "cloud", mode: str = "pro"):
    log.info(f"[CELERY TASK] Görev başladı: PDF ID {pdf_id} (Dosya yolu: {storage_path})")

    try:
        text_content = pdf_service.extract_text_from_pdf_path(storage_path)

        prompt_instruction = (
            "Aşağıdaki metni detaylı bir şekilde analiz et. "
            "Metnin ana fikrini, temel argümanlarını ve önemli çıkarımlarını "
            "madde madde özetle."
        )

        summary = summarize_text(
            text_content,
            prompt_instruction,
            llm_provider=llm_provider,
            mode=mode,
        )

        success_payload = {"status": "completed", "summary": summary, "pdf_id": pdf_id, "llm_provider": llm_provider}
        with httpx.Client() as client:
            r = client.post(callback_url, json=success_payload, timeout=30)
            r.raise_for_status()

        return {"status": "success", "summary_length": len(summary)}

    except Exception as e:
        log.error(f"[CELERY TASK] HATA: PDF ID {pdf_id} | {str(e)}")
        error_payload = {"status": "failed", "error": str(e), "pdf_id": pdf_id, "llm_provider": llm_provider}

        try:
            with httpx.Client() as client:
                client.post(callback_url, json=error_payload, timeout=30)
        except Exception:
            pass

        raise
