from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Header, Body
from fastapi.responses import StreamingResponse
from typing import Dict, List, Optional
from pypdf import PdfReader, PdfWriter
from pydantic import BaseModel
import httpx
import html
import io
import re
import os
from datetime import datetime, timezone
from sqlalchemy.orm import Session

# --- Config & DB ---
from ..config import settings
from ..db import get_supabase, Client, get_db
from ..storage import save_pdf_to_db, get_pdf_from_db, delete_pdf_from_db, list_user_pdfs
from ..deps import get_current_user, get_current_user_from_header
from ..models import UserStatsResponse, User
import logging

logger = logging.getLogger(__name__)

# --- ReportLab Importları (PDF Oluşturma İçin) ---
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.units import inch
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

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
        logger.info(f"Normal Font Yüklendi: {regular_font_path}")
    
    if os.path.exists(bold_font_path):
        pdfmetrics.registerFont(TTFont('SourceSansPro-Bold', bold_font_path))
        FONT_NAME_BOLD = 'SourceSansPro-Bold'
        logger.info(f"Kalın Font Yüklendi: {bold_font_path}")
    else:
        if FONT_NAME_REGULAR != "Helvetica":
            FONT_NAME_BOLD = FONT_NAME_REGULAR

except Exception as e:
    logger.warning(f"Font yükleme hatası: {e}", exc_info=True)


# ==========================================
# YARDIMCI FONKSİYONLAR
# ==========================================

async def validate_file_size(file: UploadFile, is_guest: bool):
    """Dosya boyutunu kontrol eder."""
    limit_mb = settings.MAX_FILE_SIZE_GUEST_MB if is_guest else settings.MAX_FILE_SIZE_USER_MB
    limit_bytes = limit_mb * 1024 * 1024

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > limit_bytes:
        user_type = "Misafir" if is_guest else "Kayıtlı Kullanıcı"
        raise HTTPException(
            status_code=413, 
            detail=f"{user_type} limiti aşıldı! Maksimum {limit_mb} MB dosya yükleyebilirsiniz."
        )


def get_ai_service_headers() -> dict:
    """AI Service'e yapılan istekler için header'ları hazırlar (API key dahil)."""
    headers = {}
    if settings.AI_SERVICE_API_KEY:
        headers["X-API-Key"] = settings.AI_SERVICE_API_KEY
    return headers


def get_user_llm_provider(db: Session, user_id: str) -> str:
    """
    Kullanıcının DB'deki LLM tercihine göre provider string'i döndürür.
    llm_choice_id: 0 = "local", 1 = "cloud"
    Eğer kullanıcı bulunamazsa default "local" döner.
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            # llm_choice_id: 0 = local llm, 1 = cloud llm
            return "local" if user.llm_choice_id == 0 else "cloud"
        return "local"  # Default: local (KVKK için güvenli)
    except Exception as e:
        logger.warning(f"Failed to get user LLM choice for {user_id}: {e}")
        return "local"  # Default: local (KVKK için güvenli)

# --- GÜNCELLENMİŞ VE LOGLAYAN HELPER FONKSİYONU ---

async def increment_user_usage(user_id: str, supabase: Client, operation_type: str):
    """
    Kullanıcının işlem istatistiğini artırır.
    UPSERT yerine açık UPDATE/INSERT mantığı kullanır.
    """
    logger.debug(f"ISTATISTIK GÜNCELLEME - User ID: {user_id}, İşlem Tipi: {operation_type}")

    # Misafir kontrolü
    if not user_id or str(user_id).startswith("guest"):
        logger.debug("Misafir kullanıcı, istatistik tutulmuyor.")
        return
    
    target_column = "summary_count" if operation_type == "summary" else "tools_count"
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # 1. ADIM: Kullanıcının istatistik kaydı var mı?
        res = supabase.table("user_stats").select("*").eq("user_id", user_id).execute()
        
        # Kayıt bulunduysa -> GÜNCELLE (UPDATE)
        if res.data and len(res.data) > 0:
            current_data = res.data[0]
            current_val = current_data.get(target_column, 0)
            new_val = current_val + 1
            
            logger.debug(f"User stats update - {target_column}: {current_val} -> {new_val}")
            
            update_data = {
                target_column: new_val,
                "last_activity": now_iso
            }
            
            # Sadece ilgili satırı güncelle
            supabase.table("user_stats").update(update_data).eq("user_id", user_id).execute()
            logger.debug(f"User stats updated successfully for user: {user_id}")

        # Kayıt yoksa -> OLUŞTUR (INSERT)
        else:
            logger.debug(f"Creating new user stats record for user: {user_id}")
            new_data = {
                "user_id": user_id,
                "summary_count": 1 if target_column == "summary_count" else 0,
                "tools_count": 1 if target_column == "tools_count" else 0,
                "last_activity": now_iso
            }
            supabase.table("user_stats").insert(new_data).execute()
            logger.debug(f"New user stats record created for user: {user_id}")

    except Exception as e:
        logger.error(f"İstatistik güncellenemedi: {e}", exc_info=True)
        # Hatanın ne olduğunu görmek için exception'ı yazdırıyoruz ama akışı kırmıyoruz.

def parse_page_ranges(range_str: str, max_pages: int) -> list[int]:
    """Sayfa aralığı stringini parse eder."""
    if not range_str:
        raise ValueError("Sayfa aralığı boş olamaz.")
    page_indices = set()
    parts = range_str.split(',')
    for part in parts:
        part = part.strip()
        if not part: continue
        if re.fullmatch(r'\d+', part):
            page_num = int(part)
            if 1 <= page_num <= max_pages:
                page_indices.add(page_num - 1)
        elif re.fullmatch(r'\d+-\d+', part):
            start_str, end_str = part.split('-')
            start, end = map(int, part.split('-'))
            for page_num in range(start, end + 1):
                if 1 <= page_num <= max_pages:
                    page_indices.add(page_num - 1)
    return sorted(list(page_indices))


# ==========================================
# GENEL ÖZETLEME
# ==========================================

@router.post("/summarize")
async def summarize_file(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db)
):
    """Frontend'deki 'handleSummarize' fonksiyonunun çağırdığı SENKRON endpoint."""
    print("\n--- SUMMARIZE İSTEĞİ ---")
    
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir.")

    # USER ID ÇÖZÜMLEME
    user_id = None
    if authorization:
        try:
            user_data = get_current_user_from_header(authorization)
            user_id = user_data.get("sub")
            print(f"✅ Token Çözüldü. User ID: {user_id}")
        except Exception as e:
            print(f"⚠️ Token Hatası: {str(e)}")
            pass
    else:
        print("👤 Misafir Kullanıcı")

    # Boyut Kontrolü
    is_guest = user_id is None
    await validate_file_size(file, is_guest=is_guest)

    try:
        file_content = await file.read()
        files = {"file": ("upload.pdf", file_content, "application/pdf")}
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"
        
        # Kullanıcının LLM tercihini DB'den al
        llm_provider = "local"  # Misafir için default
        if user_id:
            llm_provider = get_user_llm_provider(db, user_id)
            user = db.query(User).filter(User.id == user_id).first()
            print(f"📊 Kullanıcı LLM Tercihi: {llm_provider} (llm_choice_id: {user.llm_choice_id if user else 'N/A'})")

        print(f"📡 AI Service İstek: {ai_service_url} (llm_provider: {llm_provider})")
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            headers = get_ai_service_headers()
            params = {"llm_provider": llm_provider}
            response = await client.post(ai_service_url, files=files, params=params, headers=headers)
            
            if response.status_code != 200:
                print(f"❌ AI Service Error: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="AI Servisi hatası")
            
            result = response.json()
            
            # İSTATİSTİK GÜNCELLEME
            if user_id:
                await increment_user_usage(user_id, supabase, "summary")

        return {
            "status": "success",
            "summary": result.get("summary"),
            "pdf_blob": None 
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="İşlem çok uzun sürdü.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Özetleme Hatası: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sunucu hatası: {str(e)}")


# ==========================================
# ÖZETLEME (MİSAFİR İÇİN)
# ==========================================

@router.post("/summarize-guest")
async def summarize_for_guest(
    file: UploadFile = File(...),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID")
):
    """Misafir kullanıcılar için ANLIK özetleme."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir")
    
    await validate_file_size(file, is_guest=True)
    
    try:
        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-sync"
        file_content = await file.read()
        
        # Misafir kullanıcılar için default: local (KVKK için güvenli)
        llm_provider = "local"
        
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            files = {"file": (file.filename, file_content, "application/pdf")}
            headers = get_ai_service_headers()
            params = {"llm_provider": llm_provider}
            response = await client.post(ai_service_url, files=files, params=params, headers=headers)
            response.raise_for_status()
        
        result = response.json()
        
        return {
            "status": "completed",
            "summary": result.get("summary"),
            "filename": file.filename,
            "method": "guest"
        }
    
    except Exception as e:
        logger.error(f"Özetleme hatası: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Sunucu hatası")


@router.post("/summarize-start/{file_id}")
async def trigger_summarize_task(
    file_id: int, 
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db: Session = Depends(get_db)
):
    """Asenkron özetleme görevi başlatır."""
    print("\n--- SUMMARIZE-START İSTEĞİ ---")
    try:
        user_id = current_user.get("sub")
        print(f"✅ Token Çözüldü. User ID: {user_id}")
        
        response = supabase.table("documents").select("*").eq("id", file_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        
        file_data = response.data
        if file_data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Erişim yetkiniz yok")
        
        # Kullanıcının LLM tercihini DB'den al
        llm_provider = get_user_llm_provider(db, user_id)
        print(f"📊 Kullanıcı LLM Tercihi: {llm_provider}")
        
        supabase.table("documents").update({"status": "processing"}).eq("id", file_id).execute()
        
        callback_url = f"http://backend:8000/files/callback/{file_id}"
        task_data = {
            "pdf_id": file_id,
            "storage_path": file_data["storage_path"],
            "callback_url": callback_url,
            "llm_provider": llm_provider
        }

        ai_service_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/summarize-async"
        
        async with httpx.AsyncClient(follow_redirects=True) as client:
            headers = get_ai_service_headers()
            response = await client.post(ai_service_url, json=task_data, headers=headers, timeout=10)
            response.raise_for_status()
        
        # İSTATİSTİK (Async olduğu için burada sayıyoruz)
        await increment_user_usage(user_id, supabase, "summary")
        
        return {"status": "processing", "message": "Özetleme başlatıldı", "file_id": file_id}

    except Exception as e:
        print(f"❌ Görev tetikleme hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# ASENKRON CALLBACK & SORGULAMA
# ==========================================

class SummaryCallbackData(BaseModel):
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
    if pdf_id != data.pdf_id:
        raise HTTPException(status_code=400, detail="ID mismatch")

    print(f"✅ Callback alındı: PDF ID {pdf_id}, Durum: {data.status}")

    try:
        update_data = {
            "status": data.status,
            "summary": data.summary if data.status == "completed" else None,
            "error": data.error if data.status == "failed" else None
        }
        supabase.table("documents").update(update_data).eq("id", pdf_id).execute()
        return {"status": "callback_received"}

    except Exception as e:
        print(f"❌ Callback hatası: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary/{file_id}")
async def get_file_summary(
    file_id: int,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    try:
        user_id = current_user.get("sub")
        response = supabase.table("documents").select("*").eq("id", file_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        
        if response.data.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Yetkisiz erişim")
        
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# CHAT Start
# ==========================================

@router.post("/chat/start")  # 👈 {file_id} kaldırıldı
async def start_chat_session(
    file: UploadFile = File(...), # 👈 Direkt dosyayı alıyoruz
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Veritabanına kaydetmeden, dosyayı direkt AI Service'e gönderir.
    PDF içeriği AI Service hafızasında tutulur.
    """
    print(f"\n--- CHAT START (Dosya: {file.filename}) ---")
    
    # 1. Dosya geçerlilik kontrolü
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir.")

    try:
        # 2. Dosyayı belleğe oku
        file_content = await file.read()
        
        # 3. Kullanıcının LLM tercihini DB'den al
        user_id = current_user.get("sub")
        llm_provider = get_user_llm_provider(db, user_id) if user_id else "local"
        print(f"📊 Kullanıcı LLM Tercihi: {llm_provider}")

        # 4. AI Service'e Gönder (/chat/start)
        async with httpx.AsyncClient() as client:
            # AI Service'e dosyayı multipart/form-data olarak iletiyoruz
            files = {"file": (file.filename, file_content, "application/pdf")}
            target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat/start"
            
            print(f"📡 AI Service'e gönderiliyor: {target_url} (llm_provider: {llm_provider})")
            headers = get_ai_service_headers()
            params = {"llm_provider": llm_provider}
            response = await client.post(target_url, files=files, params=params, headers=headers, timeout=60.0)
            
            if response.status_code != 200:
                print(f"❌ AI Service Hatası: {response.text}")
                raise HTTPException(status_code=502, detail="Yapay zeka servisi başlatılamadı.")
            
            # 4. Session ID'yi Frontend'e dön
            data = response.json()
            print(f"✅ Chat Oturumu Başladı (RAM): {data['session_id']}")
            
            return {"session_id": data["session_id"], "filename": file.filename}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Chat Start Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# CHAT Message
# ==========================================
@router.post("/chat/message")
async def send_chat_message(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Kullanıcının mesajını AI Service'e iletir.
    Body: { "session_id": "...", "message": "..." }
    """
    session_id = body.get("session_id")
    message = body.get("message")

    if not session_id or not message:
        raise HTTPException(status_code=400, detail="Session ID ve mesaj gereklidir.")

    try:
        # AI Service'e ilet (/chat)
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {"session_id": session_id, "message": message}
            target_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/chat"
            headers = get_ai_service_headers()
            response = await client.post(target_url, json=payload, headers=headers)
            
            if response.status_code != 200:
                error_detail = response.json().get("detail", "AI hatası")
                raise HTTPException(status_code=response.status_code, detail=error_detail)
            
            return response.json() # {"answer": "..."}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Chat Message Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# MARKDOWN TO PDF (GELİŞMİŞ FORMATLAMA - TABLO DESTEKLİ)
# ==========================================

class MarkdownToPdfRequest(BaseModel):
    markdown: str

@router.post("/markdown-to-pdf")
async def markdown_to_pdf(request: MarkdownToPdfRequest):
    try:
        buffer = io.BytesIO()
        # Kenar boşluklarını ayarlıyoruz
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
        styles = getSampleStyleSheet()
        
        # --- Özel Stiller ---
        
        # Normal Metin Stili
        style_normal = ParagraphStyle(
            'TrNormal', 
            parent=styles['Normal'], 
            fontName=FONT_NAME_REGULAR, 
            fontSize=10, 
            leading=14, 
            spaceAfter=6
        )
        
        # Başlık Stili (H1 - #)
        style_heading_1 = ParagraphStyle(
            'TrHeading1', 
            parent=styles['Heading1'], 
            fontName=FONT_NAME_BOLD, 
            fontSize=16, 
            leading=20, 
            spaceAfter=12, 
            spaceBefore=12,
            textColor=colors.HexColor("#1a365d") # Koyu Lacivert
        )

        # Alt Başlık Stili (H2 - ##)
        style_heading_2 = ParagraphStyle(
            'TrHeading2', 
            parent=styles['Heading2'], 
            fontName=FONT_NAME_BOLD, 
            fontSize=13, 
            leading=16, 
            spaceAfter=10, 
            spaceBefore=6,
            textColor=colors.HexColor("#2c3e50")
        )

        # Liste Stili (Bullet)
        style_bullet = ParagraphStyle(
            'TrBullet', 
            parent=style_normal, 
            leftIndent=20, 
            bulletIndent=10,
            spaceAfter=4
        )

        # Tablo Hücre Stili
        style_cell = ParagraphStyle(
            'TableCell', 
            parent=style_normal, 
            fontSize=9, 
            leading=11,
            spaceAfter=0
        )
        
        # Tablo Başlık Hücresi Stili
        style_cell_header = ParagraphStyle(
            'TableCellHeader', 
            parent=style_normal, 
            fontName=FONT_NAME_BOLD,
            fontSize=9, 
            leading=11,
            textColor=colors.white,
            spaceAfter=0
        )

        story = []
        lines = request.markdown.split('\n')
        
        # --- Helper: Markdown -> ReportLab XML Dönüştürücü ---
        def format_inline_markdown(text):
            if not text: return ""
            # HTML karakterlerini bozmamak için escape et
            text = html.escape(text)
            # Bold: **text** -> <b>text</b>
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            # Italic: *text* -> <i>text</i>
            text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
            # Code: `text` -> kırmızı courier font
            text = re.sub(r'`(.*?)`', r'<font face="Courier" color="#e74c3c">\1</font>', text)
            return text

        # --- Tablo İşleme ---
        table_buffer = [] # Tablo satırlarını burada biriktireceğiz
        in_table = False

        for line in lines:
            original_line = line.strip()
            
            # 1. TABLO TESPİTİ
            if original_line.startswith('|'):
                in_table = True
                # Hücreleri ayır
                cells = [c.strip() for c in original_line.split('|')]
                # İlk ve son boş elemanları temizle (Markdown tabloları | ile başlar ve biter)
                if len(cells) > 1 and cells[0] == '': cells.pop(0)
                if len(cells) > 0 and cells[-1] == '': cells.pop(-1)
                
                # Ayırıcı satırı kontrol et (:--- gibi)
                is_separator = all(re.match(r'^[\s\-:]+$', c) for c in cells)
                
                if not is_separator and cells:
                    # Hücre içindeki markdown'ı işle (bold vs.)
                    row_data = []
                    # Eğer bu tablonun ilk satırıysa (Başlık) farklı stil kullan
                    is_header_row = (len(table_buffer) == 0)
                    
                    for cell in cells:
                        formatted_cell = format_inline_markdown(cell)
                        current_style = style_cell_header if is_header_row else style_cell
                        row_data.append(Paragraph(formatted_cell, current_style))
                    
                    table_buffer.append(row_data)
                continue
            
            else:
                # Tablo bittiyse ve buffer doluysa çiz
                if in_table and table_buffer:
                    col_count = max(len(row) for row in table_buffer)
                    if col_count > 0:
                        # Sayfa genişliğine göre sütun genişliği ayarla
                        # A4 width ~595pt. Margins 40+40=80. Usable ~515.
                        avail_width = A4[0] - 80
                        col_width = avail_width / col_count
                        
                        t = Table(table_buffer, colWidths=[col_width] * col_count)
                        
                        # Tablo Stili
                        t.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1a365d")), # Header Arkaplan (Lacivert)
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),                # Header Yazı (Beyaz)
                            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),                # Çizgiler
                            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]), # Zebra satırlar
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                            ('TOPPADDING', (0, 0), (-1, -1), 8),
                        ]))
                        story.append(t)
                        story.append(Spacer(1, 12))
                    
                    table_buffer = []
                    in_table = False

            if not original_line:
                continue

            # 2. METİN FORMATLAMA
            formatted_text = format_inline_markdown(original_line)

            # Başlık Seviye 1 (I. II. III. veya #)
            if original_line.startswith('# ') or re.match(r'^[IVX]+\.', original_line):
                clean_text = formatted_text.lstrip('#').strip()
                story.append(Paragraph(clean_text, style_heading_1))
            
            # Başlık Seviye 2 (A. B. C. veya ##)
            elif original_line.startswith('## ') or re.match(r'^[A-Z]\.', original_line):
                clean_text = formatted_text.lstrip('#').strip()
                story.append(Paragraph(clean_text, style_heading_2))

            # Liste Maddeleri (•, -, *)
            elif original_line.startswith(('-', '*', '•')):
                # Başındaki işareti temizle
                clean_text = re.sub(r'^[\-\*\•]\s*', '', formatted_text)
                story.append(Paragraph(f"• {clean_text}", style_bullet))

            # Normal Paragraf
            else:
                story.append(Paragraph(formatted_text, style_normal))

        # Döngü bittiğinde, dosya sonunda tablo varsa çiz
        if in_table and table_buffer:
             col_count = max(len(row) for row in table_buffer)
             # Genişlik hesabı (Tekrar)
             avail_width = A4[0] - 80
             col_width = avail_width / col_count
             
             t = Table(table_buffer, colWidths=[col_width]*col_count)
             t.setStyle(TableStyle([
                 ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1a365d")),
                 ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                 ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                 ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                 ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
                 ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                 ('TOPPADDING', (0, 0), (-1, -1), 8),
             ]))
             story.append(t)

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

class TTSRequest(BaseModel):
    text: str

def clean_markdown_for_tts(text: str) -> str:
    if not text: return ""
    text = re.sub(r'[*`_~]', '', text)
    text = re.sub(r'#{1,6}\s*', '', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'^\s*[-+*]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'-{2,}', '', text)
    text = re.sub(r'\n+', '. ', text)
    return text.strip()

@router.post("/listen-summary")
async def listen_summary(
    request: TTSRequest,
    authorization: Optional[str] = Header(None),
    supabase: Client = Depends(get_supabase)
):
    print("\n--- LISTEN (TTS) İSTEĞİ ---")
    if not request.text:
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    # USER ID ÇÖZÜMLEME
    user_id = None
    if authorization:
        try:
            user_data = get_current_user_from_header(authorization)
            user_id = user_data.get("sub")
            print(f"✅ Token Çözüldü. User ID: {user_id}")
        except:
            pass

    cleaned_text = clean_markdown_for_tts(request.text)
    ai_tts_url = f"{settings.AI_SERVICE_URL}/api/v1/ai/tts"

    async def iter_audio():
        client = None
        try:
            client = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
            headers = get_ai_service_headers()
            async with client.stream("POST", ai_tts_url, json={"text": cleaned_text}, headers=headers) as response:
                if response.status_code != 200:
                    return 
                async for chunk in response.aiter_bytes():
                    yield chunk
        except Exception as e:
            print(f"TTS Error: {e}")
        finally:
            if client:
                # İSTATİSTİK GÜNCELLEME
                if user_id:
                    await increment_user_usage(user_id, supabase, "summary")
                await client.aclose()

    return StreamingResponse(iter_audio(), media_type="audio/mpeg")


# ==========================================
# FILE OPERATIONS (Upload, Delete, List)
# ==========================================

@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID"),
    db: Session = Depends(get_db)
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    
    user_id = None
    if authorization:
        try:
            user_data = get_current_user_from_header(authorization)
            user_id = user_data.get("sub")
        except:
            pass
    
    if not user_id:
        user_id = x_guest_id or "guest"
    
    is_guest_user = str(user_id).startswith("guest")
    await validate_file_size(file, is_guest=is_guest_user)
    
    try:
        # PDF'i oku
        pdf_content = await file.read()
        filename = file.filename or "document.pdf"
        
        # Sadece kayıtlı kullanıcılar için DB'ye kaydet
        if not is_guest_user:
            pdf_record = save_pdf_to_db(db, user_id, pdf_content, filename)
            return {
                "file_id": pdf_record.id,
                "filename": pdf_record.filename or filename,
                "file_size": pdf_record.file_size
            }
        
        # Misafir kullanıcılar için sadece filename döndür (DB'ye kaydetmiyoruz)
        return {"filename": filename, "message": "Guest upload - not saved to database"}
        
    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Upload failed")

@router.get("/my-files")
async def get_my_files(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        
        pdfs = list_user_pdfs(db, user_id)
        files = [
            {
                "id": pdf.id,
                "filename": pdf.filename,
                "file_size": pdf.file_size,
                "created_at": pdf.created_at.isoformat() if pdf.created_at else None
            }
            for pdf in pdfs
        ]
        return {"files": files, "total": len(files)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get files error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        
        # Önce PDF'in kullanıcıya ait olduğunu kontrol et
        pdf = get_pdf_from_db(db, file_id, user_id)
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF bulunamadı veya yetkiniz yok")
        
        # PDF'i sil
        delete_pdf_from_db(db, file_id, user_id)
        return {"message": "Silindi", "file_id": file_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete file error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# TOOLS (Convert, Extract, Merge, Reorder)
# ==========================================

@router.post("/convert-text")
async def convert_text_from_pdf(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    supabase: Client = Depends(get_supabase)
):
    """PDF'den metin çıkarır."""
    print("\n--- CONVERT-TEXT İSTEĞİ ---")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF gerekli")
    
    # USER ID ÇÖZÜMLEME
    user_id = None
    if authorization:
        try:
            user_id = get_current_user(authorization).get("sub")
            print(f"✅ Token Çözüldü. User ID: {user_id}")
        except: pass

    try:
        pdf_content = await file.read()
        reader = PdfReader(io.BytesIO(pdf_content))
        text = "\n".join([p.extract_text() for p in reader.pages if p.extract_text()])
        
        base_filename = file.filename.replace('.pdf', '') if file.filename else 'document'
        
        # İSTATİSTİK
        if user_id:
            await increment_user_usage(user_id, supabase, "tool")

        return StreamingResponse(
            io.BytesIO(text.encode('utf-8')),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{base_filename}.txt"'}
        )
    except Exception as e:
        print(f"Hata: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-pages")
async def extract_pdf_pages(
    file: UploadFile = File(...),
    page_range: str = Form(...),
    authorization: Optional[str] = Header(None),
    supabase: Client = Depends(get_supabase)
):
    """Sayfa ayıklama."""
    logger.debug("EXTRACT-PAGES İSTEĞİ alındı")
    
    # USER ID ÇÖZÜMLEME
    user_id = None
    if authorization:
        try:
            user_id = get_current_user(authorization).get("sub")
            logger.debug(f"Token çözüldü. User ID: {user_id}")
        except: pass

    try:
        reader = PdfReader(io.BytesIO(await file.read()))
        max_pages = len(reader.pages)
        indices = parse_page_ranges(page_range, max_pages)
        
        if not indices:
             raise HTTPException(status_code=400, detail="Geçersiz sayfa aralığı.")

        writer = PdfWriter()
        for i in indices:
            writer.add_page(reader.pages[i])
        
        out = io.BytesIO()
        writer.write(out)
        out.seek(0)
        
        # İSTATİSTİK
        if user_id:
            await increment_user_usage(user_id, supabase, "tool")
            
        return StreamingResponse(out, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="extracted.pdf"'})
    except Exception as e:
        logger.error(f"Extract pages hatası: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Sunucu hatası")


@router.post("/merge-pdfs")
async def merge_pdfs(
    files: List[UploadFile] = File(...),
    authorization: Optional[str] = Header(None),
    supabase: Client = Depends(get_supabase)
):
    """PDF Birleştirme."""
    print("\n--- MERGE-PDFS İSTEĞİ ---")
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="En az 2 PDF gerekli.")

    # USER ID ÇÖZÜMLEME
    user_id = None
    if authorization:
        try:
            user_id = get_current_user(authorization).get("sub")
            print(f"✅ Token Çözüldü. User ID: {user_id}")
        except: pass
        
    try:
        writer = PdfWriter()
        for f in files:
            reader = PdfReader(io.BytesIO(await f.read()))
            for p in reader.pages:
                writer.add_page(p)
        
        out = io.BytesIO()
        writer.write(out)
        out.seek(0)
        
        # İSTATİSTİK
        if user_id:
            await increment_user_usage(user_id, supabase, "tool")

        return StreamingResponse(out, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="merged.pdf"'})
    except Exception as e:
        print(f"Hata: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save-processed")
async def save_processed_pdf(
    file: UploadFile = File(...),
    filename: str = Form(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        user_id = current_user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")
        
        # PDF'i oku
        pdf_content = await file.read()
        
        # DB'ye kaydet
        pdf_record = save_pdf_to_db(db, user_id, pdf_content, filename)
        
        return {
            "file_id": pdf_record.id,
            "filename": pdf_record.filename or filename,
            "size_kb": round(pdf_record.file_size / 1024, 2) if pdf_record.file_size else 0,
            "message": "File saved successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Save processed error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reorder")
async def reorder_pdf(
    file: UploadFile = File(...),
    page_numbers: str = Form(...),
    authorization: Optional[str] = Header(None),
    supabase: Client = Depends(get_supabase)
):
    """Sayfa Sıralama."""
    print("\n--- REORDER-PDF İSTEĞİ ---")
    
    # USER ID ÇÖZÜMLEME
    user_id = None
    if authorization:
        try:
            user_id = get_current_user(authorization).get("sub")
            print(f"✅ Token Çözüldü. User ID: {user_id}")
        except: pass

    try:
        reader = PdfReader(io.BytesIO(await file.read()))
        writer = PdfWriter()
        order = [int(x.strip())-1 for x in page_numbers.split(',')]
        
        if any(p < 0 or p >= len(reader.pages) for p in order):
             raise HTTPException(status_code=400, detail="Hatalı sayfa numarası.")

        for i in order:
            writer.add_page(reader.pages[i])
                
        out = io.BytesIO()
        writer.write(out)
        out.seek(0)
        
        # İSTATİSTİK
        if user_id:
            await increment_user_usage(user_id, supabase, "tool")
            
        return StreamingResponse(out, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="reordered.pdf"'})
    except Exception as e:
        print(f"Hata: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ==========================================
# USER STATS (GET)
# ==========================================

@router.get("/user/stats", response_model=UserStatsResponse)
async def get_user_stats(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """Giriş yapmış kullanıcının istatistiklerini getirir."""
    try:
        user_id = current_user.get("sub")
        if not user_id:
             raise HTTPException(status_code=401, detail="User ID not found")

        response = supabase.table("user_stats")\
            .select("summary_count,tools_count")\
            .eq("user_id", user_id)\
            .execute()
        
        if response.data:
            return UserStatsResponse(**response.data[0])
        else:
            return UserStatsResponse(summary_count=0, tools_count=0)

    except Exception as e:
        print(f"❌ İstatistik çekme hatası: {str(e)}")
        # Hata durumunda frontend'i bozmamak için 0 dön
        return UserStatsResponse(summary_count=0, tools_count=0)
    

# ==========================================
# GLOBAL STATS (LANDING PAGE)
# ==========================================

@router.get("/global-stats")
def get_global_stats(supabase: Client = Depends(get_supabase)):
    """
    Ana sayfa için tüm kullanıcıların toplam istatistiklerini döner.
    Auth gerektirmez (Public).
    """
    try:
        # 1. Toplam Kullanıcı Sayısı
        # count='exact', head=True -> Sadece sayıyı getirir, veriyi çekmez (Hızlıdır)
        users_response = supabase.table("users").select("*", count="exact", head=True).execute()
        total_users = users_response.count if users_response.count is not None else 0

        # 2. İşlem Sayılarını Topla
        # Not: Supabase API'de doğrudan "sum" olmadığı için veriyi çekip Python'da topluyoruz.
        # İleride veri çok büyürse Supabase RPC (SQL Function) kullanmak gerekir.
        stats_response = supabase.table("user_stats").select("summary_count, tools_count").execute()
        
        total_tools = 0
        total_ai = 0
        
        if stats_response.data:
            for row in stats_response.data:
                total_tools += row.get("tools_count", 0)
                total_ai += row.get("summary_count", 0)

        return {
            "total_users": total_users,
            "total_processed": total_tools + total_ai, # Toplam dosya işlemi
            "total_ai_summaries": total_ai             # Toplam AI işlemi
        }

    except Exception as e:
        print(f"❌ Global stats error: {str(e)}")
        # Hata olsa bile frontend bozulmasın diye 0 dön
        return {
            "total_users": 0,
            "total_processed": 0,
            "total_ai_summaries": 0
        }