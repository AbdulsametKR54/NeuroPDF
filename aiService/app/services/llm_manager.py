from fastapi import HTTPException
from typing import Literal, Optional

from . import ai_service  # gemini tarafın
from .local_llm_service import analyze_text_with_local_llm  #  yerel LLM tarafı
from typing import Literal

LLMProvider = Literal["cloud", "local"]
CloudMode = Literal["flash", "pro"]

def summarize_text(
    text: str,
    prompt_instruction: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "flash",
) -> str:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Boş içerik gönderildi.")

    if llm_provider == "cloud":
        return ai_service.gemini_generate(text, prompt_instruction, mode=mode)

    if llm_provider == "local":
        # local LLM’de prompt+text’i birleştirip analiz/özet ürettiriyoruz
        # (yerelde "summary" dönmesini sağlayacağız)
        result = analyze_text_with_local_llm(text, task="summarize", instruction=prompt_instruction)
        return result.get("summary", "") or "Local LLM yanıt üretmedi."

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider. 'cloud' veya 'local' olmalı.")


def chat_over_pdf(
    session_text: str,
    filename: str,
    history_text: str,
    user_message: str,
    llm_provider: LLMProvider = "cloud",
    mode: CloudMode = "pro",
) -> str:
    if llm_provider == "cloud":
        # mevcut ai_service.chat_with_pdf’nin prompt yapısını koruyalım:
        # onun içinden provider seçmek yerine, burada prompt’u hazırlayıp gemini çağıracağız.
        # En az değişiklik: ai_service’e yeni bir fonksiyon ekleyelim:
        return ai_service.gemini_chat(prompt=_build_chat_prompt(session_text, filename, history_text, user_message), mode=mode)

    if llm_provider == "local":
        result = analyze_text_with_local_llm(
            _build_chat_prompt(session_text, filename, history_text, user_message),
            task="chat",
            instruction="PDF asistanı gibi yanıt ver. Türkçe, net ve pratik ol."
        )
        # local taraf chatte direkt metin döndürebilir:
        return result.get("answer") or result.get("summary") or "Local LLM yanıt üretmedi."

    raise HTTPException(status_code=400, detail="Geçersiz llm_provider.")


def _build_chat_prompt(pdf_context: str, filename: str, history_text: str, user_message: str) -> str:
    system_instruction = (
        "Sen bir PDF asistanısın. Kullanıcının yüklediği PDF'e dayanarak cevap ver.\n"
        "Eğer PDF'te açıkça yoksa, bunu belirt ve kullanıcıdan sayfa/başlık gibi ipucu iste.\n"
        "Cevaplarını Türkçe ver, net ve pratik ol.\n"
    )

    return f"""
{system_instruction}

DOSYA: {filename}

PDF İÇERİĞİ:
---
{pdf_context}
---

SOHBET GEÇMİŞİ:
---
{history_text}
---

KULLANICI SORUSU:
{user_message}
""".strip()
