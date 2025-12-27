import os
import json
import re
import ollama
from .text_cleaner import detect_unknown_words


OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")

def extract_json(text: str):
    try:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        return None
    except Exception:
        return None

def analyze_text_with_local_llm(text: str, task: str = "summarize", instruction: str = "") -> dict:
    """
    task:
      - summarize: text'i düzelt + özetle
      - chat: gelen prompt'u direkt cevapla (PDF chat gibi)
    """
    client = ollama.Client(host=OLLAMA_HOST)

    if task == "chat":
        # Chat için tek aşama yeterli
        system_prompt = instruction or "Türkçe cevap ver."
        try:
            resp = client.chat(
                model=OLLAMA_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                options={"temperature": 0.3},
            )
            answer = resp["message"]["content"]
            return {"answer": answer}
        except Exception as e:
            return {"answer": f"Local LLM hatası: {str(e)}"}

    # summarize (mevcut 2 aşamalı yaklaşımını koruyoruz)
    try:
        suspects = detect_unknown_words(text)
        suspects_str = ", ".join(suspects) if suspects else "Yok"
    except Exception:
        suspects_str = "Hata"

    correction_system_prompt = """
    Sen bir Yazım Denetleme Motorusun.
    Görevin: Metindeki 'şeuler' -> 'şeyler', 'gidiyom' -> 'gidiyorum' gibi hataları bulmaktır.
    ASLA yeni kelime uydurma. Sadece bozuk kelimeleri onar.
    """

    correction_user_prompt = f"""
    METİN: "{text}"
    HATALI KELİME İPUÇLARI: [{suspects_str}]

    ÇIKTI (SADECE JSON):
    {{
        "corrected_text": "Metnin tamamen düzeltilmiş hali buraya",
        "corrections": [
            {{ "original": "hatalı", "corrected": "doğru", "reason": "sebep" }}
        ]
    }}
    """

    try:
        correction_response = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": correction_system_prompt},
                {"role": "user", "content": correction_user_prompt},
            ],
            options={"temperature": 0.0},
        )

        correction_data = extract_json(correction_response["message"]["content"])
        if not correction_data:
            correction_data = {"corrected_text": text, "corrections": []}

        corrected_text = correction_data.get("corrected_text", text)
        corrections_list = correction_data.get("corrections", [])

        summary_system_prompt = """
        Sen yetenekli bir Edebiyatçısın.
        Görevin: Sana verilen düzgün metni, akıcı ve anlamlı bir İstanbul Türkçesi ile özetlemektir.
        Özeti yazarken metnin duygusunu koru ama gereksiz tekrarlardan kaçın.
        """

        summary_user_prompt = f"""
        METİN: "{corrected_text}"

        Lütfen bu metni en güzel ve anlamlı şekilde özetle (Tek paragraf).
        """

        summary_response = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": summary_system_prompt},
                {"role": "user", "content": summary_user_prompt},
            ],
            options={"temperature": 0.4},
        )

        final_summary = summary_response["message"]["content"]
        return {"summary": final_summary, "corrections": corrections_list}

    except Exception as e:
        return {"summary": f"Analiz sırasında hata oluştu: {str(e)}", "corrections": []}
