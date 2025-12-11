from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Header, Body
from fastapi.responses import StreamingResponse
from typing import Dict, List, Optional
from pypdf import PdfReader, PdfWriter
from pydantic import BaseModel
from fastapi import APIRouter, Body, HTTPException
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
import httpx
from ..config import settings
from ..db import get_supabase, Client
import io
import re
import os

# --- ReportLab Importları (PDF Oluşturma İçin) ---
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors  # Renkler için (colors.grey, colors.black vb.)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle # Stiller için
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
# Platypus: Otomatik sayfa düzeni ve Tablo desteği için
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from ..storage import storage_service
from ..routers.auth import get_current_user

router = APIRouter(prefix="/files", tags=["files"])

# ==========================================
# FONT AYARLARI (Source Sans Pro)
# ==========================================

current_file_path = os.path.abspath(__file__)
routers_dir = os.path.dirname(current_file_path)
app_dir = os.path.dirname(routers_dir)
backend_dir = os.path.dirname(app_dir)
fonts_dir = os.path.join(backend_dir, "fonts", "Source_Sans_Pro")

regular_font_path = os.path.join(fonts_dir, "SourceSansPro-Regular.ttf")
bold_font_path = os.path.join(fonts_dir, "SourceSansPro-Bold.ttf")

FONT_NAME_REGULAR = "Helvetica" 
FONT_NAME_BOLD = "Helvetica-Bold"

try:
    if os.path.exists(regular_font_path):
        pdfmetrics.registerFont(TTFont('SourceSansPro-Regular', regular_font_path))
        FONT_NAME_REGULAR = 'SourceSansPro-Regular'
        print(f"✅ Normal Font Yüklendi: {regular_font_path}")
    
    if os.path.exists(bold_font_path):
        pdfmetrics.registerFont(TTFont('SourceSansPro-Bold', bold_font_path))
        FONT_NAME_BOLD = 'SourceSansPro-Bold'
        print(f"✅ Kalın Font Yüklendi: {bold_font_path}")
    else:
        if FONT_NAME_REGULAR != "Helvetica":
            FONT_NAME_BOLD = FONT_NAME_REGULAR

except Exception as e:
    print(f"❌ Font yükleme hatası: {e}")

# ==========================================
# GENEL ÖZETLEME
# ==========================================

@router.post("/summarize")
async def summarize_file(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None) 
):
    """
    Frontend'deki 'handleSummarize' fonksiyonunun çağırdığı SENKRON endpoint.
    Dosyayı alır -> AI Service'e gönderir -> Cevabı Frontend'e iletir.
    """
    
    # 1. Dosya Tipi Kontrolü
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir.")

    try:
        # 2. Dosya İçeriğini Oku
        file_content = await file.read()
        
        # 3. AI Service'e Gönderilecek Veriyi Hazırla
        # NOT: Türkçe karakter hatası (Unicode) almamak için dosya adını 'upload.pdf' olarak sabitliyoruz.
        files = {
            "file": ("upload.pdf", file_content, "application/pdf")
        }

        # AI Service URL'i (Port 8001'de çalıştığını varsayıyoruz)
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"

        # 4. AI Service'e İstek At
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(ai_service_url, files=files)
            
            if response.status_code != 200:
                print(f"❌ AI Service Error: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="AI Servisi hatası")
            
            result = response.json()

        # 5. Sonucu Frontend'e Dön
        return {
            "status": "success",
            "summary": result.get("summary"),
            "pdf_blob": None 
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="İşlem çok uzun sürdü (Zaman Aşımı).")
    except Exception as e:
        print(f"❌ Özetleme Hatası: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sunucu hatası: {str(e)}")


# ==========================================
# ÖZETLEME (İKİ YOL)
# ==========================================

@router.post("/summarize-guest")
async def summarize_for_guest(
    file: UploadFile = File(...),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """
    ✅ Misafir kullanıcılar için ANLIK özetleme.
    
    - Dosyayı AI Service'e gönderir
    - Anında sonuç döner
    - Veritabanı gerektirmez
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir")
    
    try:
        # AI Service'in senkron endpoint'ine gönder
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"
        
        # Dosyayı oku
        file_content = await file.read()
        
        # AI Service'e gönder
        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {"file": (file.filename, file_content, "application/pdf")}
            response = await client.post(ai_service_url, files=files)
            response.raise_for_status()
        
        result = response.json()
        
        return {
            "status": "completed",
            "summary": result.get("summary"),
            "filename": file.filename,
            "method": "guest"
        }
    
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI servisi zaman aşımına uğradı")
    except httpx.HTTPError as e:
        print(f"❌ AI Service hatası: {e}")
        raise HTTPException(status_code=503, detail="AI servisi şu anda kullanılamıyor")
    except Exception as e:
        print(f"❌ Özetleme hatası: {e}")
        raise HTTPException(status_code=500, detail=f"Özetleme başarısız: {str(e)}")


@router.post("/summarize-start/{file_id}")
async def trigger_summarize_task(
    file_id: int, 
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Frontend'den gelen "Özetle" butonuna basıldığında bu tetiklenir.
    Bu endpoint, aiService'e asenkron bir görev emri gönderir.
    """
    
    try:
        user_id = current_user.get("sub")
        
        # Supabase'den dosya bilgisini çek
        response = supabase.table("documents").select("*").eq("id", file_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        
        file_data = response.data
        storage_path = file_data["storage_path"]
        
        # Kullanıcının dosyası mı kontrol et
        if file_data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Bu dosyaya erişim yetkiniz yok")
        
        # Dosya durumunu "processing" olarak güncelle
        supabase.table("documents").update({
            "status": "processing"
        }).eq("id", file_id).execute()
        
        # Callback URL oluştur
        callback_url = f"http://backend:8000/files/callback/{file_id}"
        
        # AI Service'e gönderilecek task data
        task_data = {
            "pdf_id": file_id,
            "storage_path": storage_path,
            "callback_url": callback_url
        }

        # AI Service'e asenkron görev gönder
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-async"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(ai_service_url, json=task_data, timeout=10)
            response.raise_for_status()
        
        print(f"✅ aiService'e görev emri başarıyla gönderildi: {response.json()}")
        
        return {
            "status": "processing",
            "message": "Özetleme işlemi başlatıldı",
            "file_id": file_id
        }

    except HTTPException:
        raise
    except httpx.ConnectError as e:
        print(f"❌ aiService'e bağlanılamadı: {e}")
        raise HTTPException(status_code=503, detail="AI servisine şu anda ulaşılamıyor.")
    except httpx.HTTPStatusError as e:
        print(f"❌ aiService görev emrini reddetti: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"AI servisi hatası: {e.response.text}")
    except Exception as e:
        print(f"❌ Görev tetiklenirken bilinmeyen hata: {e}")
        raise HTTPException(status_code=500, detail=f"Görevi tetiklerken sunucu hatası: {str(e)}")


# ==========================================
# ASENKRON AI SONUCUNU ALMA (CALLBACK)
# ==========================================

class SummaryCallbackData(BaseModel):
    """aiCeleryWorker'dan gelen JSON verisinin modeli"""
    pdf_id: int
    status: str
    summary: Optional[str] = None
    error: Optional[str] = None


@router.post("/callback/{pdf_id}")
async def handle_ai_callback(
    pdf_id: int, 
    data: SummaryCallbackData,
    supabase: Client = Depends(get_supabase)
):
    """
    aiCeleryWorker, özetleme işini bitirdiğinde bu endpoint'i çağırır.
    """
    
    if pdf_id != data.pdf_id:
        raise HTTPException(
            status_code=400, 
            detail="URL ID and payload ID do not match"
        )

    print(f"✅ Callback alındı: PDF ID {pdf_id}, Durum: {data.status}")

    try:
        if data.status == "completed":
            print(f"✅ BAŞARI: Özet alındı: {data.summary[:100]}...")
            
            # Supabase'e başarılı sonucu kaydet
            update_data = {
                "summary": data.summary,
                "status": "completed",
                "error": None
            }
            supabase.table("documents").update(update_data).eq("id", pdf_id).execute()
            
            print(f"✅ Özet veritabanına kaydedildi: PDF ID {pdf_id}")

        else:
            print(f"❌ HATA: İşleme hatası: {data.error}")
            
            # Supabase'e hata durumunu kaydet
            update_data = {
                "status": "failed",
                "error": data.error,
                "summary": None
            }
            supabase.table("documents").update(update_data).eq("id", pdf_id).execute()
            
            print(f"❌ Hata durumu veritabanına kaydedildi: PDF ID {pdf_id}")

        return {
            "status": "callback_received", 
            "pdf_id": pdf_id,
            "result_status": data.status
        }

    except Exception as e:
        print(f"❌ Callback işlenirken hata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Callback işlenirken hata: {str(e)}")


# ==========================================
# ÖZET SORGULAMA
# ==========================================

@router.get("/summary/{file_id}")
async def get_file_summary(
    file_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Dosyanın özetini ve durumunu getir.
    """
    try:
        user_id = current_user.get("sub")
        
        # Dosya bilgisini çek
        response = supabase.table("documents").select("id, filename, status, summary, error, created_at").eq("id", file_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        
        file_data = response.data
        
        # Kullanıcının dosyası mı kontrol et
        if file_data.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Bu dosyaya erişim yetkiniz yok")
        
        return file_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Özet sorgulama hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# MARKDOWN TO PDF (PDF İNDİRME)
# ==========================================

class MarkdownToPdfRequest(BaseModel):
    markdown: str

@router.post("/markdown-to-pdf")
async def markdown_to_pdf(request: MarkdownToPdfRequest):
    """
    Markdown metnini alır, Tabloları ve Türkçe karakterleri işleyerek PDF'e çevirir.
    Platypus motoru kullanıldığı için sayfa taşmaları ve tablolar otomatik yönetilir.
    """
    try:
        buffer = io.BytesIO()
        
        # 1. Doküman Şablonu (Sayfa kenar boşlukları)
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=50, leftMargin=50,
            topMargin=50, bottomMargin=50
        )

        # 2. Stiller
        styles = getSampleStyleSheet()
        
        # Türkçe destekli Normal Stil
        style_normal = ParagraphStyle(
            'TurkishNormal',
            parent=styles['Normal'],
            fontName=FONT_NAME_REGULAR,
            fontSize=11,
            leading=16, # Satır aralığı
            spaceAfter=8
        )

        # Başlık Stili
        style_heading = ParagraphStyle(
            'TurkishHeading',
            parent=styles['Heading1'],
            fontName=FONT_NAME_BOLD,
            fontSize=14,
            leading=18,
            spaceAfter=12,
            spaceBefore=12,
            textColor=colors.HexColor("#2c3e50")
        )

        # Tablo Hücresi Stili (Daha küçük font)
        style_cell = ParagraphStyle(
            'TableCell',
            parent=styles['Normal'],
            fontName=FONT_NAME_REGULAR,
            fontSize=10,
            leading=12
        )

        # 3. İçerik Oluşturma (Story)
        story = []
        lines = request.markdown.split('\n')
        
        table_buffer = [] # Tablo satırlarını biriktirmek için
        in_table = False

        for line in lines:
            line = line.strip()

            # --- TABLO ALGILAMA MANTIĞI ---
            if line.startswith('|'):
                # Tablo satırı ise
                in_table = True
                
                # Markdown tablosundaki satırı hücrelere böl
                # Örnek: | Hücre 1 | Hücre 2 | -> ['Hücre 1', 'Hücre 2']
                cells = [cell.strip() for cell in line.split('|') if cell]
                
                # Ayırıcı satır kontrolü (örn: |---|---|)
                # Eğer satır sadece tire (-) ve iki nokta (:) içeriyorsa bu bir ayırıcıdır, veriye ekleme
                is_separator = all(re.match(r'^[\s\-:]+$', c) for c in cells)
                
                if not is_separator:
                    # Hücre içindeki metni Paragraph'a çevir (Word Wrap için)
                    row_data = [Paragraph(cell, style_cell) for cell in cells]
                    table_buffer.append(row_data)
                
                continue # Sonraki satıra geç (Tablo işlemeye devam et)
            
            else:
                # Eğer tablo modundaysak ve normal satıra geldiysek, TABLOYU OLUŞTUR
                if in_table and table_buffer:
                    # Sütun sayısını bul (en geniş satıra göre)
                    col_count = max(len(row) for row in table_buffer)
                    # Sayfa genişliği (A4 genişliği - kenar boşlukları)
                    avail_width = A4[0] - 100 
                    col_width = avail_width / col_count

                    t = Table(table_buffer, colWidths=[col_width] * col_count)
                    
                    # Tablo Stili
                    t.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f3f4f6")), # Başlık arkaplanı
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                        ('FONTNAME', (0, 0), (-1, 0), FONT_NAME_BOLD), # Başlık fontu
                        ('FONTNAME', (0, 1), (-1, -1), FONT_NAME_REGULAR),
                        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), # Izgara çizgileri
                    ]))
                    
                    story.append(t)
                    story.append(Spacer(1, 12))
                    
                    # Buffer'ı temizle
                    table_buffer = []
                    in_table = False

            # --- NORMAL METİN İŞLEME ---
            if not line:
                continue

            # Başlıklar
            if line.startswith('#'):
                clean_line = line.lstrip('#').strip()
                story.append(Paragraph(clean_line, style_heading))
                continue
            
            # Madde İşaretleri
            if line.startswith('* ') or line.startswith('- '):
                # Bullet karakteri ekle
                clean_line = f"• {line[2:]}"
                # Bold temizliği
                clean_line = clean_line.replace('**', '')
                story.append(Paragraph(clean_line, style_normal))
            else:
                # Düz metin
                clean_line = line.replace('**', '')
                story.append(Paragraph(clean_line, style_normal))

        # Döngü bittiğinde hala bekleyen tablo varsa ekle
        if in_table and table_buffer:
            col_count = max(len(row) for row in table_buffer)
            avail_width = A4[0] - 100 
            col_width = avail_width / col_count
            t = Table(table_buffer, colWidths=[col_width] * col_count)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (-1, -1), FONT_NAME_REGULAR),
            ]))
            story.append(t)

        # 4. PDF'i Oluştur
        doc.build(story)
        
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="ozet.pdf"'}
        )

    except Exception as e:
        print(f"❌ PDF Hatası: {str(e)}")
        raise HTTPException(status_code=500, detail=f"PDF hatası: {str(e)}")
    
# ==========================================
# UPLOAD & STORAGE MANAGEMENT (YEREL + DB)
# ==========================================

@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID"),
    supabase: Client = Depends(get_supabase)
):
    """PDF'i YEREL uploads klasörüne kaydet ve DB'ye kayıt ekle."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    
    user_id = None
    if authorization:
        try:
            user_data = get_current_user(authorization)
            user_id = user_data.get("sub")
        except:
            pass
    
    if not user_id:
        user_id = x_guest_id or "guest"
    
    try:
        # Dosyayı yerel storage'a kaydet
        upload_result = await storage_service.upload_file(file, user_id)
        print(f"✅ File uploaded locally: {upload_result['path']}")
        
        # Kayıtlı kullanıcı ise DB'ye kaydet
        if user_id != "guest" and not user_id.startswith("guest_"):
            document_data = {
                "user_id": user_id,
                "filename": upload_result["filename"],
                "storage_path": upload_result["path"],
                "status": "uploaded"
            }
            
            db_response = supabase.table("documents").insert(document_data).execute()
            
            if db_response.data:
                file_id = db_response.data[0]["id"]
                print(f"✅ File saved to database with ID: {file_id}")
                
                return {
                    "file_id": file_id,
                    "filename": upload_result["filename"],
                    "size_kb": round(upload_result["size"] / 1024, 2),
                    "file_path": upload_result["path"],
                    "message": "File uploaded successfully"
                }
        
        # Guest kullanıcı için sadece yerel storage
        return {
            "filename": upload_result["filename"],
            "size_kb": round(upload_result["size"] / 1024, 2),
            "file_path": upload_result["path"],
            "message": "File uploaded successfully (guest mode)"
        }
        
    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-files")
async def get_my_files(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """Kullanıcının tüm dosyalarını listele."""
    try:
        user_id = current_user.get("sub")
        
        # Kullanıcının dosyalarını çek
        response = supabase.table("documents").select(
            "id, filename, status, created_at"
        ).eq("user_id", user_id).order("created_at", desc=True).execute()
        
        return {
            "files": response.data,
            "total": len(response.data)
        }
        
    except Exception as e:
        print(f"List files error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """Dosyayı hem yerel storage'dan hem de DB'den sil."""
    try:
        user_id = current_user.get("sub")
        
        # Dosya bilgisini çek
        response = supabase.table("documents").select("*").eq("id", file_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        
        file_data = response.data
        
        # Kullanıcının dosyası mı kontrol et
        if file_data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Bu dosyayı silme yetkiniz yok")
        
        # Yerel dosyayı sil
        import os
        storage_path = file_data["storage_path"]
        if os.path.exists(storage_path):
            os.remove(storage_path)
            print(f"✅ Yerel dosya silindi: {storage_path}")
        
        # DB kaydını sil
        supabase.table("documents").delete().eq("id", file_id).execute()
        print(f"✅ DB kaydı silindi: {file_id}")
        
        return {
            "message": "Dosya başarıyla silindi",
            "file_id": file_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# PDF PROCESSING
# ==========================================

def parse_page_ranges(range_str: str, max_pages: int) -> list[int]:
    """Kullanıcıdan gelen sayfa aralığı dizesini 0-tabanlı dizinlere dönüştürür."""
    if not range_str:
        raise ValueError("Sayfa aralığı boş olamaz.")
        
    page_indices = set()
    parts = range_str.split(',')
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
            
        if re.fullmatch(r'\d+', part):
            page_num = int(part)
            if 1 <= page_num <= max_pages:
                page_indices.add(page_num - 1)
            else:
                raise ValueError(f"Sayfa {page_num} maksimum sayfa sayısını aşıyor.")
        
        elif re.fullmatch(r'\d+-\d+', part):
            start_str, end_str = part.split('-')
            start = int(start_str)
            end = int(end_str)
            
            if start > end:
                raise ValueError(f"Geçersiz aralık: {start}-{end}.")
                
            for page_num in range(start, end + 1):
                if 1 <= page_num <= max_pages:
                    page_indices.add(page_num - 1)
        else:
            raise ValueError(f"Geçersiz format: '{part}'.")

    return sorted(list(page_indices))


@router.post("/convert-text")
async def convert_text_from_pdf(
    file: UploadFile = File(...),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """PDF'den metin çıkarır ve .txt olarak döndürür."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Lütfen bir PDF dosyası yükleyin.")

    try:
        pdf_content = await file.read()
        pdf_stream = io.BytesIO(pdf_content)
        reader = PdfReader(pdf_stream)
        
        full_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                full_text.append(text)
        
        final_text = "\n".join(full_text)
        text_bytes = final_text.encode('utf-8')
        text_stream = io.BytesIO(text_bytes)
        
        base_filename = file.filename.replace('.pdf', '') if file.filename else 'document'
        new_filename = f"{base_filename}.txt"

        return StreamingResponse(
            text_stream,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{new_filename}"'}
        )

    except Exception as e:
        print(f"Metin çıkarma hatası: {e}")
        raise HTTPException(status_code=500, detail=f"PDF'den metin çıkarılırken hata: {str(e)}")


@router.post("/extract-pages")
async def extract_pdf_pages(
    file: UploadFile = File(...),
    page_range: str = Form(...),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """PDF'den belirtilen sayfaları çıkarır."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Lütfen bir PDF dosyası yükleyin.")

    pdf_content = await file.read()
    input_pdf_stream = io.BytesIO(pdf_content)

    try:
        reader = PdfReader(input_pdf_stream)
        max_pages = len(reader.pages)
        
        page_indices = parse_page_ranges(page_range, max_pages)
        
        if not page_indices:
            raise HTTPException(status_code=400, detail="Geçersiz sayfa aralığı.")

        writer = PdfWriter()
        for index in page_indices:
            writer.add_page(reader.pages[index])

        output_pdf_stream = io.BytesIO()
        writer.write(output_pdf_stream)
        output_pdf_stream.seek(0)

        return StreamingResponse(
            output_pdf_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="extracted_{file.filename}"'}
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"PDF işleme hatası: {e}")
        raise HTTPException(status_code=500, detail="PDF işlenirken hata oluştu.")


@router.post("/merge-pdfs")
async def merge_pdfs(
    files: List[UploadFile] = File(...),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """Birden fazla PDF'i birleştirir."""
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="En az 2 PDF gerekli.")

    writer = PdfWriter()

    for file in files:
        if file.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail=f"'{file.filename}' geçerli bir PDF değil.")
        
        try:
            pdf_content = await file.read()
            pdf_stream = io.BytesIO(pdf_content)
            reader = PdfReader(pdf_stream)
            
            for page in reader.pages:
                writer.add_page(page)

        except Exception as e:
            print(f"PDF birleştirme hatası ({file.filename}): {e}")
            raise HTTPException(status_code=500, detail=f"'{file.filename}' işlenirken hata.")

    output_pdf_stream = io.BytesIO()
    writer.write(output_pdf_stream)
    writer.close()
    output_pdf_stream.seek(0)

    return StreamingResponse(
        output_pdf_stream,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="birlestirilmis_dokuman.pdf"'}
    )


@router.post("/save-processed")
async def save_processed_pdf(
    file: UploadFile = File(...),
    filename: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """İşlenmiş PDF'i kullanıcının YEREL klasörüne kaydet."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    
    try:
        user_id = current_user.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        
        upload_result = await storage_service.upload_file(file, user_id)
        
        print(f"✅ File saved locally: {upload_result['path']}")
        
        return {
            "filename": filename,
            "size_kb": round(upload_result["size"] / 1024, 2),
            "saved_path": upload_result["path"],
            "message": "File saved successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/reorder")
async def reorder_pdf(
    file: UploadFile = File(...),
    page_numbers: str = Form(...),  # örn: "3,1,2,4"
):
    """
    Frontend'den gelen sayfa sıralamasına göre PDF'i yeniden sırala.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    
    try:
        # PDF oku
        pdf_content = await file.read()
        pdf_stream = io.BytesIO(pdf_content)
        reader = PdfReader(pdf_stream)
        writer = PdfWriter()

        max_pages = len(reader.pages)

        # page_numbers dizisini listeye çevir
        page_order = [int(x.strip()) for x in page_numbers.split(",")]

        # geçerliliğini kontrol et
        if any(p < 1 or p > max_pages for p in page_order):
            raise HTTPException(status_code=400, detail="Page numbers out of range")
        if len(page_order) != max_pages:
            raise HTTPException(status_code=400, detail="Page count mismatch")

        # sayfaları sırala
        for page_num in page_order:
            writer.add_page(reader.pages[page_num - 1])

        output_stream = io.BytesIO()
        writer.write(output_stream)
        output_stream.seek(0)

        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="reordered_{file.filename}"'}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")