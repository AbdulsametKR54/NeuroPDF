from celery import Celery
from ..config import settings
import logging

log = logging.getLogger(__name__)

celery_app = Celery(
    "ai_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.pdf_tasks"],
)

celery_app.conf.update(
    task_track_started=True,
)

log.info(f"✅ Celery app 'ai_tasks' configured with broker: {settings.REDIS_URL}")