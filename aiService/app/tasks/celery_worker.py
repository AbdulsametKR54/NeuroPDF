from celery import Celery
from ..config import settings
import logging

log = logging.getLogger(__name__)

celery_app = Celery(
    "ai_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    # --- DÜZELTME BAŞLANGICI ---
    # Celery'ye, başlarken 'app.tasks.pdf_tasks' modülünü 
    # yüklemesini ve içindeki görevleri kaydetmesini SÖYLÜYORUZ.
    include=['app.tasks.pdf_tasks']
    # --- DÜZELTME SONU ---
)

celery_app.conf.update(
    task_track_started=True,
)

# Artık 'autodiscover_tasks'a veya 'pdf_tasks'ı manuel import etmeye gerek yok.
# 'include' parametresi bu işi yapar.

log.info(f"✅ Celery app 'ai_tasks' configured with broker: {settings.REDIS_URL}")

