from pathlib import Path
from fastapi import UploadFile, HTTPException
from typing import Optional
import uuid
import os
import logging
from sqlalchemy.orm import Session  # ✅ Import eklendi
from .models import UserAvatar, User, PDF

# Logger kurulumu ✅
logger = logging.getLogger(__name__)

class StorageService:
    """Yerel dosya sistemi depolama servisi (PDF ve Dokümanlar için)"""
    
    def __init__(self):
        self.base_dir = Path(__file__).parent.parent / "uploads"
        self.base_dir.mkdir(exist_ok=True, parents=True)
        logger.info(f"Storage initialized at: {self.base_dir.absolute()}")
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """
        Dosya adını temizler ve güvenli hale getirir.
        Path traversal saldırılarını ve tehlikeli karakterleri engeller.
        """
        import re
        
        # Path traversal karakterlerini temizle
        filename = filename.replace("..", "").replace("/", "").replace("\\", "")
        
        # Tehlikeli karakterleri temizle
        dangerous_chars = ['<', '>', ':', '"', '|', '?', '*']
        for char in dangerous_chars:
            filename = filename.replace(char, "")
        
        # Çoklu boşlukları tek boşluğa çevir
        filename = re.sub(r'\s+', '_', filename)
        
        # Başta ve sonda boşluk/nokta karakterlerini temizle
        filename = filename.strip('. ')
        
        # Dosya adı çok uzunsa kısalt
        if len(filename) > 200:
            name, ext = os.path.splitext(filename)
            filename = name[:200-len(ext)] + ext
        
        # Boşsa default isim ver
        if not filename:
            filename = "document"
        
        return filename
    
    @staticmethod
    def generate_file_path(user_id: Optional[str], filename: str) -> str:
        file_id = str(uuid.uuid4())
        safe_filename = StorageService.sanitize_filename(filename)
        return f"{user_id}/{file_id}_{safe_filename}" if user_id else f"guest/{file_id}_{safe_filename}"
    
    async def upload_file(self, file: UploadFile, user_id: Optional[str] = None) -> dict:
        try:
            content = await file.read()
            file_size = len(content)
            relative_path = self.generate_file_path(user_id, file.filename or "document.pdf")
            full_path = self.base_dir / relative_path
            full_path.parent.mkdir(exist_ok=True, parents=True)
            
            with open(full_path, "wb") as f:
                f.write(content)
            
            return {
                "path": relative_path,
                "url": f"/uploads/{relative_path}",
                "size": file_size,
                "filename": file.filename or "document.pdf"
            }
        except Exception as e:
            logger.error(f"Storage upload error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Upload failed")

# Singleton instance
storage_service = StorageService()

# ==========================================
# AVATAR (BLOB - DB) SİSTEMİ
# ==========================================

def save_avatar_to_db(db: Session, user_id: str, image_bytes: bytes, is_ai: bool = False):
    """Kullanıcı profil fotoğrafını veritabanında BLOB olarak saklar."""
    try:
        # 1. Eski aktif resmi pasif yap
        db.query(UserAvatar).filter(
            UserAvatar.user_id == user_id, 
            UserAvatar.is_active == True
        ).update({"is_active": False})

        # 2. Yeni kayıt (İstediğin format: {userId}_profilepicture.png)
        new_avatar = UserAvatar(
            user_id=user_id,
            filename=f"{user_id}_profilepicture.png",
            data=image_bytes,
            is_active=True,
            is_ai_generated=is_ai
        )
        db.add(new_avatar)

        # 3. User tablosundaki URL alanını güncelle
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.active_avatar_url = f"/api/v1/user/{user_id}/avatar"

        db.commit()
        db.refresh(new_avatar)
        return new_avatar
    except Exception as e:
        db.rollback()
        logger.error(f"Avatar save error: {e}")
        raise

def get_active_avatar(db: Session, user_id: str):
    """Kullanıcının aktif profil resmini getirir"""
    return db.query(UserAvatar).filter(
        UserAvatar.user_id == user_id, 
        UserAvatar.is_active == True
    ).first()


# ==========================================
# PDF (BLOB - DB) SİSTEMİ
# ==========================================

def save_pdf_to_db(db: Session, user_id: str, pdf_bytes: bytes, filename: Optional[str] = None) -> PDF:
    """PDF dosyasını veritabanında BLOB olarak saklar."""
    try:
        pdf_id = str(uuid.uuid4())
        file_size = len(pdf_bytes)
        safe_filename = StorageService.sanitize_filename(filename) if filename else None
        
        new_pdf = PDF(
            id=pdf_id,
            user_id=user_id,
            pdf_data=pdf_bytes,
            filename=safe_filename,
            file_size=file_size
        )
        db.add(new_pdf)
        db.commit()
        db.refresh(new_pdf)
        return new_pdf
    except Exception as e:
        db.rollback()
        logger.error(f"PDF save error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF kaydetme hatası: {str(e)}")


def get_pdf_from_db(db: Session, pdf_id: str, user_id: Optional[str] = None) -> Optional[PDF]:
    """PDF dosyasını veritabanından getirir."""
    try:
        query = db.query(PDF).filter(PDF.id == pdf_id)
        if user_id:
            query = query.filter(PDF.user_id == user_id)
        return query.first()
    except Exception as e:
        logger.error(f"PDF get error: {e}", exc_info=True)
        return None


def delete_pdf_from_db(db: Session, pdf_id: str, user_id: Optional[str] = None) -> bool:
    """PDF dosyasını veritabanından siler."""
    try:
        query = db.query(PDF).filter(PDF.id == pdf_id)
        if user_id:
            query = query.filter(PDF.user_id == user_id)
        pdf = query.first()
        if pdf:
            db.delete(pdf)
            db.commit()
            return True
        return False
    except Exception as e:
        db.rollback()
        logger.error(f"PDF delete error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF silme hatası: {str(e)}")


def list_user_pdfs(db: Session, user_id: str) -> list[PDF]:
    """Kullanıcının tüm PDF dosyalarını listeler."""
    try:
        return db.query(PDF).filter(PDF.user_id == user_id).order_by(PDF.created_at.desc()).all()
    except Exception as e:
        logger.error(f"PDF list error: {e}", exc_info=True)
        return []