# app/storage.py
from pathlib import Path
from fastapi import UploadFile, HTTPException
from typing import Optional
import uuid
import os

# ==========================================
# YEREL DEPOLAMA SİSTEMİ
# ==========================================
# Bu sistem hem Windows, Mac, Linux'ta çalışır
# Klasörler otomatik oluşturulur
# ==========================================

class StorageService:
    """Yerel dosya sistemi depolama servisi"""
    
    def __init__(self):
        """
        Storage klasörünü başlat
        Backend klasörü içinde 'uploads' klasörü oluşturur
        """
        # Backend root dizinini bul
        self.base_dir = Path(__file__).parent.parent / "uploads"
        
        # Ana uploads klasörünü oluştur (yoksa)
        self.base_dir.mkdir(exist_ok=True, parents=True)
        
        print(f"✅ Storage initialized at: {self.base_dir.absolute()}")
    
    @staticmethod
    def generate_file_path(user_id: Optional[str], filename: str) -> str:
        """
        Dosya path'i oluştur: {user_id}/{uuid}_{filename}
        """
        file_id = str(uuid.uuid4())
        safe_filename = filename.replace(" ", "_")
        
        if user_id:
            return f"{user_id}/{file_id}_{safe_filename}"
        else:
            # Guest kullanıcılar için
            return f"guest/{file_id}_{safe_filename}"
    
    async def upload_file(
        self,
        file: UploadFile,
        user_id: Optional[str] = None
    ) -> dict:
        """
        Dosyayı yerel diske kaydet
        
        Returns:
            dict: {
                "path": "relative/path/to/file.pdf",
                "url": "/uploads/user_id/file.pdf",
                "size": 12345,
                "filename": "original.pdf"
            }
        """
        try:
            # Dosya içeriğini oku
            content = await file.read()
            file_size = len(content)
            
            # Dosya yolu oluştur
            relative_path = self.generate_file_path(
                user_id, 
                file.filename or "document.pdf"
            )
            
            # Tam dosya yolu
            full_path = self.base_dir / relative_path
            
            # Kullanıcı klasörünü oluştur (yoksa)
            full_path.parent.mkdir(exist_ok=True, parents=True)
            
            # Dosyayı kaydet
            with open(full_path, "wb") as f:
                f.write(content)
            
            print(f"✅ File saved: {full_path}")
            
            # URL oluştur (frontend için)
            url = f"/uploads/{relative_path}"
            
            return {
                "path": relative_path,
                "url": url,
                "size": file_size,
                "filename": file.filename or "document.pdf"
            }
            
        except Exception as e:
            print(f"❌ Storage upload error: {e}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to upload: {str(e)}"
            )
    
    def delete_file(self, file_path: str) -> bool:
        """
        Dosyayı yerel diskten sil
        
        Args:
            file_path: Relative path (örn: "user_123/abc.pdf")
        """
        try:
            full_path = self.base_dir / file_path
            
            if full_path.exists():
                full_path.unlink()
                print(f"✅ File deleted: {full_path}")
                return True
            else:
                print(f"⚠️ File not found: {full_path}")
                return False
                
        except Exception as e:
            print(f"❌ Error deleting file: {e}")
            return False
    
    def get_file_path(self, relative_path: str) -> Path:
        """
        Relative path'den tam path al
        
        Args:
            relative_path: "user_123/abc.pdf"
            
        Returns:
            Path: Full path to file
        """
        return self.base_dir / relative_path
    
    def file_exists(self, relative_path: str) -> bool:
        """
        Dosyanın var olup olmadığını kontrol et
        """
        return (self.base_dir / relative_path).exists()
    
    def get_storage_info(self) -> dict:
        """
        Depolama bilgilerini al (debug için)
        """
        total_size = 0
        file_count = 0
        
        for file_path in self.base_dir.rglob("*"):
            if file_path.is_file():
                total_size += file_path.stat().st_size
                file_count += 1
        
        return {
            "base_dir": str(self.base_dir.absolute()),
            "total_files": file_count,
            "total_size_mb": round(total_size / (1024 * 1024), 2)
        }

# Singleton instance
storage_service = StorageService()

# ==========================================
# İLK BAŞLATMADA BİLGİLENDİRME
# ==========================================
if __name__ == "__main__":
    print("📁 Storage Service Info:")
    print(storage_service.get_storage_info())