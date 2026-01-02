# backend/app/services/llm_manager.py

from fastapi import HTTPException
from typing import Literal, Optional

from . import ai_service  # gemini tarafı
from .local_llm_service import analyze_text_with_local_llm  # yerel LLM tarafı

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
    # 1. Prompt'u Hazırla
    full_prompt = _build_chat_prompt(session_text, filename, history_text, user_message)

    if llm_provider == "cloud":
        # DÜZELTME: ai_service.gemini_chat YOKTU. 
        # Bunun yerine elimizdeki 'gemini_generate' fonksiyonunu kullanıyoruz.
        # Hazırladığımız 'full_prompt'u metin olarak veriyoruz.
        return ai_service.gemini_generate(
            text_content=full_prompt, 
            prompt_instruction="Aşağıdaki PDF bağlamına ve sohbet geçmişine göre yanıtla:", 
            mode=mode
        )

    if llm_provider == "local":
        result = analyze_text_with_local_llm(
            full_prompt,
            task="chat",
            instruction="PDF asistanı gibi yanıt ver. Türkçe, net ve pratik ol."
        )
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