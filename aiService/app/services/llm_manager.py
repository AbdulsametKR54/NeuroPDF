# import ollama
# import os
# import json
# import re
# from app.services.text_cleaner import detect_unknown_words

# #OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://ollama:11434")

# OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

# def extract_json(text: str):
#     try:
#         match = re.search(r'\{.*\}', text, re.DOTALL)
#         if match:
#             return json.loads(match.group(0))
#         return None
#     except Exception:
#         return None

# def analyze_text_with_ai(text: str):
#     print(f"Gemma2 (Çift Aşamalı Analiz)... Host: {OLLAMA_HOST}")
    
#     # 1. ZEYREK TARAMASI
#     try:
#         suspects = detect_unknown_words(text)
#         suspects_str = ", ".join(suspects) if suspects else "Yok"
#     except Exception:
#         suspects_str = "Hata"

#     # --- AŞAMA 1: DÜZELTME (ROBOT MODU) ---
#     # Burada yaratıcılık SIFIR. Sadece tamirat.
#     correction_system_prompt = """
#     Sen bir Yazım Denetleme Motorusun.
#     Görevin: Metindeki 'şeuler' -> 'şeyler', 'gidiyom' -> 'gidiyorum' gibi hataları bulmaktır.
#     ASLA yeni kelime uydurma. Sadece bozuk kelimeleri onar.
#     """
    
#     correction_user_prompt = f"""
#     METİN: "{text}"
#     HATALI KELİME İPUÇLARI: [{suspects_str}]
    
#     ÇIKTI (SADECE JSON):
#     {{
#         "corrected_text": "Metnin tamamen düzeltilmiş hali buraya",
#         "corrections": [
#             {{ "original": "hatalı", "corrected": "doğru", "reason": "sebep" }}
#         ]
#     }}
#     """
    
#     client = ollama.Client(host=OLLAMA_HOST)
    
#     try:
#         # Adım 1: Düzeltme İsteği (Temperature 0.0 - En güvenli)
#         correction_response = client.chat(model='gemma2', messages=[
#           {'role': 'system', 'content': correction_system_prompt},
#           {'role': 'user', 'content': correction_user_prompt},
#         ], options={'temperature': 0.0}) 
        
#         correction_data = extract_json(correction_response['message']['content'])
        
#         if not correction_data:
#             # Eğer JSON bozuksa ham metni kullan
#             correction_data = {"corrected_text": text, "corrections": []}
            
#         corrected_text = correction_data.get("corrected_text", text)
#         corrections_list = correction_data.get("corrections", [])

#         # --- AŞAMA 2: ÖZETLEME (YAZAR MODU) ---
#         # Şimdi elimizde düzgün metin var. Artık yaratıcı olabiliriz.
#         summary_system_prompt = """
#         Sen yetenekli bir Edebiyatçısın.
#         Görevin: Sana verilen düzgün metni, akıcı ve anlamlı bir İstanbul Türkçesi ile özetlemektir.
#         Özeti yazarken metnin duygusunu koru ama gereksiz tekrarlardan kaçın.
#         """
        
#         summary_user_prompt = f"""
#         METİN: "{corrected_text}"
        
#         Lütfen bu metni en güzel ve anlamlı şekilde özetle (Tek paragraf).
#         """
        
#         # Adım 2: Özet İsteği (Temperature 0.4 - Biraz yaratıcılık serbest)
#         summary_response = client.chat(model='gemma2', messages=[
#           {'role': 'system', 'content': summary_system_prompt},
#           {'role': 'user', 'content': summary_user_prompt},
#         ], options={'temperature': 0.4})
        
#         final_summary = summary_response['message']['content']

#         # SONUÇLARI BİRLEŞTİR
#         return {
#             "summary": final_summary,
#             "corrections": corrections_list
#         }

#     except Exception as e:
#         print(f"LLM Hatası: {str(e)}")
#         return {"summary": "Analiz sırasında hata oluştu.", "corrections": []}