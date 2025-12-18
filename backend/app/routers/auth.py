from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from datetime import datetime, timedelta, timezone
import jwt
import hashlib
from supabase import Client
from typing import Optional
from pathlib import Path

# Config ve DB importları
from ..config import settings
from ..db import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])

# ==========================================
# MODELS
# ==========================================

class GoogleExchangeIn(BaseModel):
    id_token: str

class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str | None = None
    username: str | None = None
    eula_accepted: bool | None = None
    created_at: datetime | None = None  # ✅ YENİ: Kayıt tarihi eklendi

class RegisterIn(BaseModel):
    username: str
    email: str
    password: str
    eula_accepted: bool

class LoginIn(BaseModel):
    email: str
    password: str

class AcceptEulaIn(BaseModel):
    accepted: bool

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Header'dan gelen JWT token'ı çözer ve kullanıcı bilgilerini döner.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_iss": True},
            issuer="fastapi"
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def create_jwt(user: dict) -> str:
    """
    Kullanıcı için yeni bir JWT token oluşturur.
    """
    now = datetime.now(timezone.utc)
    user_id = str(user.get("id"))
    
    claims = {
        "sub": user_id,
        "email": user.get("email"),
        "username": user.get("username"),
        "eula_accepted": user.get("eula_accepted", False),
        "exp": now + timedelta(minutes=settings.JWT_EXPIRES_MIN),
        "iat": now,
        "iss": "fastapi",
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")

# ==========================================
# GOOGLE LOGIN
# ==========================================

@router.post("/google", response_model=AuthOut)
def exchange_google_token(payload: GoogleExchangeIn, supabase: Client = Depends(get_supabase)):
    """
    Google ID Token'ı doğrular ve kullanıcıyı giriş yaptırır/kaydeder.
    """
    try:
        info = id_token.verify_oauth2_token(
            payload.id_token,
            grequests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    sub = info.get("sub")
    email = info.get("email")
    name = info.get("name") or (email.split("@")[0] if email else "User")

    # Kullanıcı var mı kontrol et
    response = supabase.table("users").select("*").eq("provider", "google").eq("provider_user_id", sub).execute()
    user = response.data[0] if response.data else None

    if not user:
        # Yeni kullanıcı oluştur
        insert_data = {
            "provider": "google",
            "provider_user_id": sub,
            "email": email,
            "username": name,
            "eula_accepted": False 
        }
        response = supabase.table("users").insert(insert_data).execute()
        
        if not response.data:
             raise HTTPException(status_code=500, detail="Failed to create user")
        user = response.data[0]

    token = create_jwt(user)

    return AuthOut(
        access_token=token,
        user_id=str(user["id"]),
        email=user.get("email"),
        username=user.get("username"),
        eula_accepted=user.get("eula_accepted"),
        created_at=user.get("created_at") # ✅ created_at eklendi
    )

# ==========================================
# LOCAL REGISTER
# ==========================================

@router.post("/register")
def register_user(payload: RegisterIn, supabase: Client = Depends(get_supabase)):
    """
    E-posta ve şifre ile kayıt.
    """
    if not payload.eula_accepted:
        raise HTTPException(status_code=400, detail="EULA must be accepted to register.")

    # Email veya username kontrolü
    check = supabase.table("users").select("id").or_(
        f"email.eq.{payload.email},username.eq.{payload.username}"
    ).execute()

    if check.data:
        raise HTTPException(status_code=400, detail="Email or username already taken")

    hashed = hash_password(payload.password)

    insert_data = {
        "username": payload.username,
        "email": payload.email,
        "password": hashed,
        "provider": "local",
        "eula_accepted": True
    }
    
    response = supabase.table("users").insert(insert_data).execute()
    
    if not response.data:
          raise HTTPException(status_code=500, detail="Registration failed")
          
    user = response.data[0]
    token = create_jwt(user)

    return {
        "message": "User registered successfully",
        "user_id": user["id"],
        "access_token": token,
        "token_type": "bearer",
        "created_at": user.get("created_at")
    }

# ==========================================
# LOCAL LOGIN
# ==========================================

@router.post("/login", response_model=AuthOut)
def login_user(payload: LoginIn, supabase: Client = Depends(get_supabase)):
    
    response = supabase.table("users").select("*").eq("email", payload.email).eq("provider", "local").execute()
    
    if not response.data:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = response.data[0]

    if hash_password(payload.password) != user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_jwt(user)

    return AuthOut(
        access_token=token,
        user_id=str(user["id"]),
        email=user.get("email"),
        username=user.get("username"),
        eula_accepted=user.get("eula_accepted"),
        created_at=user.get("created_at") # ✅ created_at eklendi
    )

# ==========================================
# ACCEPT EULA
# ==========================================

@router.post("/accept-eula")
def accept_eula(
    payload: AcceptEulaIn,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    if not payload.accepted:
        raise HTTPException(status_code=400, detail="You must accept the agreement.")

    user_id = current_user["sub"]

    response = supabase.table("users").update({
        "eula_accepted": True
    }).eq("id", user_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found or update failed")

    return {"message": "EULA accepted successfully"}

# ==========================================
# GET CURRENT USER (ME)
# ==========================================

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    
    user_id = current_user["sub"]
    response = supabase.table("users").select("*").eq("id", user_id).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = response.data[0]

    return {
        "user_id": user["id"],
        "email": user.get("email"),
        "username": user.get("username"),
        "provider": user.get("provider"),
        "eula_accepted": user.get("eula_accepted"),
        "created_at": user.get("created_at") # ✅ created_at eklendi
    }

# ==========================================
# GET EULA TEXT
# ==========================================
@router.get("/eula", response_class=PlainTextResponse)
def get_eula_text(lang: str = "tr"):
    """
    Frontend'den gelen dile göre EULA metnini okur ve döner.
    Backend yapısı: /backend/app/routers/auth.py ise ve docs /backend/docs altındaysa:
    """
    filename = "EULA_TR.md" if lang == "tr" else "EULA_EN.md"
    
    # Dosya yolu çözümleme
    current_file_path = Path(__file__).resolve()
    
    # auth.py -> routers -> app -> backend (ROOT)
    # Eğer yapınız farklıysa buradaki .parent sayısını ayarlamanız gerekebilir.
    # Genelde /backend/docs klasörüne ulaşmak için:
    project_root = current_file_path.parent.parent.parent 
    
    # Eğer 'app' klasörü proje köküyle aynı seviyedeyse (örn: /src/app ve /src/docs), o zaman .parent.parent yeterli olabilir.
    # Güvenli olması için şunu deneyelim: docs klasörünü app ile kardeş varsayarsak:
    if not (project_root / "docs").exists():
         # Belki bir alt seviyededir
         project_root = current_file_path.parent.parent

    file_path = project_root / "docs" / filename
    
    if file_path.exists():
        try:
            return file_path.read_text(encoding="utf-8")
        except Exception as e:
            return f"Error reading file: {str(e)}"
    else:
        # Hata ayıklama için tam yolu dönüyoruz
        return f"HATA: '{filename}' dosyası bulunamadı. Aranan yol: {file_path}"
    

# ==========================================
# DELETE ACCOUNT
# ==========================================

@router.delete("/delete-account")
def delete_account(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Giriş yapmış kullanıcının hesabını ve istatistiklerini kalıcı olarak siler.
    """
    user_id = current_user.get("sub")
    
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    try:
        # 1. Önce user_stats tablosundaki verileri sil
        # (Eğer DB'de Cascade ayarı yoksa önce child tabloyu temizlemek gerekir)
        stats_response = supabase.table("user_stats").delete().eq("user_id", user_id).execute()
        
        # 2. Ardından users tablosundan kullanıcıyı sil
        user_response = supabase.table("users").delete().eq("id", user_id).execute()

        # Silme işleminin başarılı olup olmadığını kontrol et
        # Supabase delete işleminde silinen veriyi geri döner (data doluysa silinmiştir)
        if not user_response.data:
            # Kullanıcı zaten silinmiş olabilir veya bulunamamış olabilir
            raise HTTPException(status_code=404, detail="User not found or already deleted")

        return {"message": "Account and related data deleted successfully"}

    except Exception as e:
        # Olası veritabanı hataları için (örn: FK constraint vb.)
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")