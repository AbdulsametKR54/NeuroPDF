# ai_service/app/services/pdf_service.py

import io
import PyPDF2
from fastapi import HTTPException

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Bir PDF dosyasının ham baytlarını (in-memory) alır ve metnini çıkarır.
    Misafir kullanıcıların senkron istekleri için kullanılır.
    """
    try:
        # Bayt verisini bellekte bir dosya gibi aç
        pdf_file = io.BytesIO(pdf_bytes)
        
        # PyPDF2 ile oku
        reader = PyPDF2.PdfReader(pdf_file)
        
        text_parts = []
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text_parts.append(extracted)
        
        full_text = "\n".join(text_parts)
        
        if not full_text.strip():
            # Bu durum genellikle taranmış (scanned) PDF'lerde olur
            raise HTTPException(
                status_code=400, 
                detail="PDF'ten metin çıkarılamadı. Dosya taranmış bir resim olabilir."
            )
            
        return full_text

    except PyPDF2.errors.PdfReadError:
        raise HTTPException(status_code=400, detail="Geçersiz veya bozuk PDF dosyası.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF işleme hatası: {str(e)}")


def extract_text_from_pdf_path(storage_path: str) -> str:
    """
    Paylaşılan volume'deki bir PDF dosyasının yolunu alır ve metnini çıkarır.
    Kayıtlı kullanıcıların asenkron Celery görevleri için kullanılır.
    """
    try:
        # Dosyayı paylaşılan diskten (shared_uploads) aç
        with open(storage_path, "rb") as pdf_file:
            
            # PyPDF2 ile oku
            reader = PyPDF2.PdfReader(pdf_file)
            
            text_parts = []
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text_parts.append(extracted)
            
            full_text = "\n".join(text_parts)

            if not full_text.strip():
                raise HTTPException(
                    status_code=400, 
                    detail="PDF'ten metin çıkarılamadı (taranmış resim)."
                )
                
            return full_text

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Dosya bulunamadı: {storage_path}")
    except PyPDF2.errors.PdfReadError:
        raise HTTPException(status_code=400, detail="Geçersiz veya bozuk PDF dosyası.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF işleme hatası: {str(e)}")