from fastapi import APIRouter, HTTPException, Depends, Header, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, EmailStr, field_validator
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from datetime import datetime, timedelta, timezone
import jwt
import logging
import re
from passlib.context import CryptContext
from supabase import Client
from typing import Optional
from pathlib import Path

# Config ve DB importları
from ..config import settings
from ..db import get_supabase, get_db
from ..deps import get_current_user as get_current_user_dep
from ..rate_limit import check_rate_limit
from ..services.avatar_service import create_initial_avatar_for_user
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

# Şifre güçlülük kontrolü fonksiyonu
def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Şifre güçlülük kontrolü yapar.
    Returns: (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Şifre en az 8 karakter olmalıdır"
    
    if not re.search(r'[A-Z]', password):
        return False, "Şifre en az bir büyük harf içermelidir"
    
    if not re.search(r'[a-z]', password):
        return False, "Şifre en az bir küçük harf içermelidir"
    
    if not re.search(r'\d', password):
        return False, "Şifre en az bir rakam içermelidir"
    
    return True, ""

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
    created_at: datetime | None = None

class RegisterIn(BaseModel):
    username: str
    email: EmailStr
    password: str
    eula_accepted: bool
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        is_valid, error_msg = validate_password_strength(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 50:
            raise ValueError("Username must be between 3 and 50 characters")
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        return v

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class AcceptEulaIn(BaseModel):
    accepted: bool

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
def exchange_google_token(request: Request, payload: GoogleExchangeIn, supabase: Client = Depends(get_supabase)):
    """
    Google ID Token'ı doğrular ve kullanıcıyı giriş yaptırır/kaydeder.
    """
    # Rate limiting
    if not check_rate_limit(request, "auth:google", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Çok fazla istek. Lütfen bekleyin.")
    
    try:
        info = id_token.verify_oauth2_token(
            payload.id_token,
            grequests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        logger.warning(f"Invalid Google token: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google token")

    sub = info.get("sub")
    email = info.get("email")
    name = info.get("name") or (email.split("@")[0] if email else "User")

    try:
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
                logger.error("Failed to create user in Google login")
                raise HTTPException(status_code=500, detail="Failed to create user")
            user = response.data[0]
            logger.info(f"New user created via Google: {user.get('email')}")
            
            # Yeni kullanıcı için avatar oluştur
            try:
                # SQLAlchemy session al
                from ..db import SessionLocal
                db = SessionLocal()
                try:
                    create_initial_avatar_for_user(db, str(user["id"]), name)
                except Exception as avatar_error:
                    logger.warning(f"Failed to create avatar for new user {user['id']}: {avatar_error}")
                finally:
                    db.close()
            except Exception as e:
                logger.warning(f"Avatar creation failed (non-critical): {e}")

        token = create_jwt(user)

        return AuthOut(
            access_token=token,
            user_id=str(user["id"]),
            email=user.get("email"),
            username=user.get("username"),
            eula_accepted=user.get("eula_accepted"),
            created_at=user.get("created_at")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in Google login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process Google login")

# ==========================================
# LOCAL REGISTER
# ==========================================

@router.post("/register")
def register_user(request: Request, payload: RegisterIn, supabase: Client = Depends(get_supabase)):
    """
    E-posta ve şifre ile kayıt.
    """
    # Rate limiting
    if not check_rate_limit(request, "auth:register", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Çok fazla istek. Lütfen bekleyin.")
    
    if not payload.eula_accepted:
        raise HTTPException(status_code=400, detail="EULA must be accepted to register.")

    try:
        # Email veya username kontrolü
        check = supabase.table("users").select("id").or_(
            f"email.eq.{payload.email},username.eq.{payload.username}"
        ).execute()

        if check.data:
            logger.warning(f"Registration attempt with existing email/username: {payload.email}")
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
            logger.error("Failed to create user in registration")
            raise HTTPException(status_code=500, detail="Failed to create user")
              
        user = response.data[0]
        
        # Yeni kullanıcı için avatar oluştur
        try:
            # SQLAlchemy session al
            from ..db import SessionLocal
            db = SessionLocal()
            try:
                create_initial_avatar_for_user(db, str(user["id"]), payload.username)
            except Exception as avatar_error:
                logger.warning(f"Failed to create avatar for new user {user['id']}: {avatar_error}")
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Avatar creation failed (non-critical): {e}")
        
        token = create_jwt(user)
        logger.info(f"User registered successfully: {payload.email}")

        return {
            "message": "User registered successfully",
            "user_id": user["id"],
            "access_token": token,
            "token_type": "bearer",
            "created_at": user.get("created_at")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in registration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to register user")

# ==========================================
# LOCAL LOGIN
# ==========================================

@router.post("/login", response_model=AuthOut)
def login_user(request: Request, payload: LoginIn, supabase: Client = Depends(get_supabase)):
    """
    E-posta ve şifre ile giriş.
    """
    # Rate limiting
    if not check_rate_limit(request, "auth:login", settings.RATE_LIMIT_AUTH_PER_MINUTE, 60):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Çok fazla istek. Lütfen bekleyin.")
    
    try:
        response = supabase.table("users").select("*").eq("email", payload.email).eq("provider", "local").execute()
        
        if not response.data:
            logger.warning(f"Login attempt with non-existent email: {payload.email}")
            raise HTTPException(status_code=401, detail="Invalid email or password")

        user = response.data[0]
        stored_password = user.get("password")

        # Şifre doğrulama - eski SHA256 ve yeni bcrypt desteği
        password_valid = False
        if stored_password:
            # Önce bcrypt ile dene
            if stored_password.startswith("$2b$") or stored_password.startswith("$2a$"):
                password_valid = verify_password(payload.password, stored_password)
            else:
                # Eski SHA256 hash ise
                import hashlib
                sha256_hash = hashlib.sha256(payload.password.encode("utf-8")).hexdigest()
                if sha256_hash == stored_password:
                    password_valid = True
                    # Şifreyi bcrypt'e migrate et
                    new_hash = hash_password(payload.password)
                    supabase.table("users").update({"password": new_hash}).eq("id", user["id"]).execute()
                    logger.info(f"Password migrated to bcrypt for user: {payload.email}")

        if not password_valid:
            logger.warning(f"Invalid password attempt for email: {payload.email}")
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_jwt(user)
        logger.info(f"User logged in successfully: {payload.email}")

        return AuthOut(
            access_token=token,
            user_id=str(user["id"]),
            email=user.get("email"),
            username=user.get("username"),
            eula_accepted=user.get("eula_accepted"),
            created_at=user.get("created_at")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process login")

# ==========================================
# ACCEPT EULA
# ==========================================

@router.post("/accept-eula")
def accept_eula(
    payload: AcceptEulaIn,
    current_user: dict = Depends(get_current_user_dep),
    supabase: Client = Depends(get_supabase)
):
    if not payload.accepted:
        raise HTTPException(status_code=400, detail="You must accept the agreement.")

    user_id = current_user["sub"]

    try:
        response = supabase.table("users").update({
            "eula_accepted": True
        }).eq("id", user_id).execute()
        
        if not response.data:
            logger.warning(f"EULA acceptance failed for user: {user_id}")
            raise HTTPException(status_code=404, detail="User not found or update failed")

        logger.info(f"EULA accepted by user: {user_id}")
        return {"message": "EULA accepted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in EULA acceptance: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to accept EULA")

# ==========================================
# GET CURRENT USER (ME)
# ==========================================

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user_dep), supabase: Client = Depends(get_supabase)):
    
    user_id = current_user["sub"]
    
    try:
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
            "created_at": user.get("created_at")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_me: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get user info")

# ==========================================
# GET EULA TEXT
# ==========================================
@router.get("/eula", response_class=PlainTextResponse)
def get_eula_text(lang: str = "tr"):
    """
    Frontend'den gelen dile göre EULA metnini okur ve döner.
    """
    filename = "EULA_TR.md" if lang == "tr" else "EULA_EN.md"
    
    # Dosya yolu çözümleme
    current_file_path = Path(__file__).resolve()
    project_root = current_file_path.parent.parent.parent 
    
    if not (project_root / "docs").exists():
        project_root = current_file_path.parent.parent

    file_path = project_root / "docs" / filename
    
    if file_path.exists():
        try:
            return file_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.error(f"Error reading EULA file: {e}", exc_info=True)
            return f"Error reading file: {str(e)}"
    else:
        logger.warning(f"EULA file not found: {file_path}")
        return f"HATA: '{filename}' dosyası bulunamadı. Aranan yol: {file_path}"
    

# ==========================================
# DELETE ACCOUNT
# ==========================================

@router.delete("/delete-account")
def delete_account(
    current_user: dict = Depends(get_current_user_dep),
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
        stats_response = supabase.table("user_stats").delete().eq("user_id", user_id).execute()
        
        # 2. Ardından users tablosundan kullanıcıyı sil
        user_response = supabase.table("users").delete().eq("id", user_id).execute()

        # Silme işleminin başarılı olup olmadığını kontrol et
        if not user_response.data:
            logger.warning(f"Account deletion failed for user: {user_id}")
            raise HTTPException(status_code=404, detail="User not found or already deleted")

        logger.info(f"Account deleted successfully: {user_id}")
        return {"message": "Account and related data deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in account deletion: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete account")
