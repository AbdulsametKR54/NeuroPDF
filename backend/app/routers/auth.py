from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import PlainTextResponse # <--- YENİ EKLENDİ
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from datetime import datetime, timedelta, timezone
import jwt
import hashlib
from supabase import Client
from typing import Optional
from pathlib import Path # <--- YENİ EKLENDİ (Dosya yolunu bulmak için)

# Projendeki config ve db yapısının bu yollarda olduğunu varsayıyoruz
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
    # Supabase'den dönen veri yapısına göre 'id' bazen string bazen int olabilir, string'e çeviriyoruz.
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
    Google ile gelen kullanıcı varsayılan olarak eula_accepted = False başlar.
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
    # İsim yoksa email'in başını al
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
            "eula_accepted": False  # Google kullanıcıları için kritik adım: EULA onayı henüz yok.
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
        eula_accepted=user.get("eula_accepted")
    )

# ==========================================
# LOCAL REGISTER
# ==========================================

@router.post("/register")
def register_user(payload: RegisterIn, supabase: Client = Depends(get_supabase)):
    """
    E-posta ve şifre ile kayıt. EULA onayı zorunludur.
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
        "eula_accepted": True # Register formunda checkbox işaretlendiği için True
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
        "token_type": "bearer"
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
        eula_accepted=user.get("eula_accepted")
    )

# ==========================================
# ACCEPT EULA (Sonradan Onay)
# ==========================================

@router.post("/accept-eula")
def accept_eula(
    payload: AcceptEulaIn,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Giriş yapmış ancak EULA'yı henüz onaylamamış (örn: Google login) kullanıcılar için.
    """
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
        "eula_accepted": user.get("eula_accepted")
    }

# ==========================================
# GET EULA TEXT (YENİ EKLENEN KISIM)
# ==========================================
@router.get("/eula", response_class=PlainTextResponse)
def get_eula_text(lang: str = "tr"):
    """
    Frontend'den gelen dile göre EULA metnini okur ve döner.
    Dosyalar: projenin ana dizinindeki /docs klasöründe aranır.
    """
    filename = "EULA_TR.md" if lang == "tr" else "EULA_EN.md"
    
    # 1. Dosyanın şu an çalıştığı yeri bul (routers/auth.py)
    current_file_path = Path(__file__).resolve()
    
    # 2. İki üst dizine çıkarak proje kök dizinini bul (routers -> root)
    project_root = current_file_path.parent.parent 
    
    # 3. docs klasörü ve dosya adını ekle
    file_path = project_root / "docs" / filename

    print(f"DEBUG: EULA aranıyor -> {file_path}") # Terminalde bu yolu kontrol edebilirsin

    if file_path.exists():
        try:
            return file_path.read_text(encoding="utf-8")
        except Exception as e:
            return f"Error reading file: {str(e)}"
    else:
        return f"HATA: '{filename}' dosyası bulunamadı. Aranan yol: {file_path}"