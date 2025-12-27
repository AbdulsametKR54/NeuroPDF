# app/services/ai_service.py
from __future__ import annotations

import random
import time
import uuid
from fastapi import HTTPException

import google.generativeai as genai  # (şimdilik) -> ileride google.genai'ye geçeceksin
from ..config import settings

flash_model = None
pro_model = None

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    flash_model = genai.GenerativeModel("models/gemini-flash-latest")
    pro_model = genai.GenerativeModel("models/gemini-pro-latest")


_PDF_CHAT_SESSIONS = {}
SESSION_TTL_SECONDS = 60 * 60  # 1 saat


def _require_cloud():
    if not flash_model or not pro_model:
        raise HTTPException(status_code=503, detail="Cloud LLM yapılandırılmadı (GEMINI_API_KEY yok).")


def _cleanup_sessions():
    now = time.time()
    expired = [sid for sid, s in _PDF_CHAT_SESSIONS.items() if (now - s["created_at"]) > SESSION_TTL_SECONDS]
    for sid in expired:
        del _PDF_CHAT_SESSIONS[sid]


def _is_quota_or_rate_limit_error(err: Exception) -> bool:
    msg = str(err)
    return ("429" in msg) or ("Quota exceeded" in msg) or ("rate limit" in msg.lower())


def _generate_with_retry(model, prompt: str, attempts: int = 5):
    last_err = None
    for i in range(attempts):
        try:
            return model.generate_content(prompt)
        except Exception as e:
            last_err = e
            if _is_quota_or_rate_limit_error(e):
                sleep_s = min(60, (2**i)) + random.random() * 0.5
                time.sleep(sleep_s)
                continue
            raise
    raise last_err


def gemini_chat(prompt: str, mode: str = "pro") -> str:
    _require_cloud()
    if not prompt or not prompt.strip():
        raise HTTPException(status_code=400, detail="Boş prompt.")
    model = flash_model if mode == "flash" else pro_model
    try:
        r = _generate_with_retry(model, prompt, attempts=3)
        if getattr(r, "candidates", None):
            return r.text
        raise HTTPException(status_code=400, detail="AI yanıt üretmedi.")
    except Exception as e:
        if _is_quota_or_rate_limit_error(e):
            raise HTTPException(status_code=429, detail=f"Gemini servis yoğunluğu: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gemini servisinde hata: {str(e)}")


def gemini_generate(text_content: str, prompt_instruction: str, mode: str = "flash") -> str:
    _require_cloud()
    if not text_content or not text_content.strip():
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    MAX_TEXT_LENGTH = 50000
    if len(text_content) > MAX_TEXT_LENGTH:
        text_content = text_content[:MAX_TEXT_LENGTH]

    full_prompt = f"{prompt_instruction}\n\nMETİN:\n---\n{text_content}\n---"
    return gemini_chat(full_prompt, mode=mode)


def call_gemini_for_task(text_content: str, prompt_instruction: str) -> str:
    _require_cloud()
    if not text_content or not text_content.strip():
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    MAX_TEXT_LENGTH = 50000
    if len(text_content) > MAX_TEXT_LENGTH:
        text_content = text_content[:MAX_TEXT_LENGTH]

    full_prompt = f"{prompt_instruction}\n\nMETİN:\n---\n{text_content}\n---"

    # pro -> flash fallback
    try:
        return gemini_chat(full_prompt, mode="pro")
    except HTTPException as e:
        if e.status_code == 429:
            return gemini_chat(full_prompt, mode="flash")
        raise


def create_pdf_chat_session(pdf_text: str, filename: str | None = None, llm_provider: str = "cloud", mode: str = "pro") -> str:
    _cleanup_sessions()
    session_id = str(uuid.uuid4())
    _PDF_CHAT_SESSIONS[session_id] = {
        "text": pdf_text,
        "filename": filename or "uploaded.pdf",
        "history": [],
        "created_at": time.time(),
        "llm_provider": llm_provider,
        "mode": mode,
    }
    return session_id
