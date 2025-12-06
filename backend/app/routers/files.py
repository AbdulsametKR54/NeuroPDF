from fastapi import APIRouter, UploadFile, File
from typing import Dict
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BACKEND_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/files", tags=["files"])

@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)) -> Dict:
    # Şimdilik sadece meta döndürelim (ileride kaydedip işleme alacağız)
    if file.content_type != "application/pdf":
        return {"ok": False, "message": "Lütfen PDF yükleyin."}
    
    content = await file.read()
    size_kb = round(len(content)/1024, 2)

    # Backend/uploads klasörüne kaydediyoruz.
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe_name = os.path.basename(file.filename or "uploaded.pdf")
    base, ext = os.path.splitext(safe_name)
    candidate = os.path.join(UPLOAD_DIR, safe_name)
    i = 1
    while os.path.exists(candidate):
        candidate = os.path.join(UPLOAD_DIR, f"{base}_{i}{ext}")
        i += 1

    with open(candidate, "wb") as f:
        f.write(content)

    saved_name = os.path.basename(candidate)
    return {
        "ok": True,
        "filename": file.filename,
        "size_kb": size_kb,
        "saved_filename": saved_name,
        "saved_path": f"uploads/{saved_name}",
    }