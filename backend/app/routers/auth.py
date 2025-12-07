from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from datetime import datetime, timedelta, timezone
import jwt
import hashlib  # ← YENİ: Password hashing için
from supabase import Client
from typing import Optional

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

class SetUsernameIn(BaseModel):
    username: str

# ✅ YENİ: Local authentication için model'ler
class RegisterIn(BaseModel):
    username: str
    email: str
    password: str

class LoginIn(BaseModel):
    email: str
    password: str

# ==========================================
# HELPER FUNCTIONS
# ==========================================

# ✅ YENİ: Password hashing fonksiyonu
def hash_password(password: str) -> str:
    """SHA256 ile şifre hashleme"""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def get_current_user(
    authorization: Optional[str] = Header(None)
) -> dict:
    """JWT token'dan kullanıcı bilgilerini çıkar"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET, 
            algorithms=["HS256"],
            options={"verify_iss": True},
            issuer="fastapi"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ✅ YENİ: JWT oluşturma fonksiyonu (tekrar eden kod yerine)
def create_jwt(user: dict) -> str:
    """User objesi için JWT token oluştur"""
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user['id']),
        "email": user.get('email'),
        "username": user.get('username'),
        "exp": now + timedelta(minutes=settings.JWT_EXPIRES_MIN),
        "iat": now,
        "iss": "fastapi",
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")

# ==========================================
# GOOGLE AUTH ROUTE
# ==========================================

@router.post("/google", response_model=AuthOut)
def exchange_google_token(
    payload: GoogleExchangeIn, 
    supabase: Client = Depends(get_supabase)
):
    """
    Google OAuth token ile giriş yap.
    Kullanıcı yoksa yeni kayıt oluştur, varsa bilgilerini güncelle.
    """
    print("DEBUG: received id_token (len):", len(payload.id_token or ""))
    
    # Google token'ı doğrula
    try:
        info = id_token.verify_oauth2_token(
            payload.id_token, 
            grequests.Request(), 
            settings.GOOGLE_CLIENT_ID
        )
        print("DEBUG: verify_oauth2_token succeeded. keys:", list(info.keys()))
    except Exception as e:
        print("DEBUG: verify_oauth2_token failed:", repr(e))
        raise HTTPException(status_code=401, detail="Invalid Google token")

    # Google'dan gelen bilgileri al
    sub = info.get("sub")  # Google user ID
    email = info.get("email")
    name = info.get("name") or (email.split("@")[0] if email else None)
    
    if not sub:
        raise HTTPException(status_code=400, detail="Missing sub")

    # Kullanıcıyı ara
    try:
        response = supabase.table('users').select("*").eq(
            'provider', 'google'
        ).eq(
            'provider_user_id', sub
        ).execute()
        
        user = response.data[0] if response.data else None
    except Exception as e:
        print(f"DEBUG: Database query error: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    # Kullanıcı yoksa oluştur, varsa güncelle
    if user is None:
        print(f"DEBUG: Creating new user for Google sub={sub}")
        try:
            response = supabase.table('users').insert({
                "provider": "google",
                "provider_user_id": sub,
                "email": email,
                "username": name
            }).execute()
            user = response.data[0]
        except Exception as e:
            print(f"DEBUG: User creation error: {e}")
            raise HTTPException(status_code=500, detail="Could not create user")
    else:
        print(f"DEBUG: User exists, updating info for id={user['id']}")
        # Email veya username eksikse güncelle
        updates = {}
        if email and user.get('email') != email:
            updates['email'] = email
        if name and not user.get('username'):
            updates['username'] = name
        
        if updates:
            try:
                response = supabase.table('users').update(updates).eq(
                    'id', user['id']
                ).execute()
                user = response.data[0]
            except Exception as e:
                print(f"DEBUG: User update error: {e}")

    # ✅ DÜZELTME: create_jwt helper fonksiyonunu kullan
    token = create_jwt(user)

    return AuthOut(
        access_token=token,
        user_id=str(user['id']),
        email=user.get('email'),
        username=user.get('username'),
    )

# ==========================================
# ✅ YENİ: LOCAL AUTH ROUTES
# ==========================================

@router.post("/register")
def register_user(
    payload: RegisterIn,
    supabase: Client = Depends(get_supabase)
):
    """
    Yeni kullanıcı kaydı (local, email/password ile)
    
    ✅ YENİ ENDPOINT
    """
    try:
        # Email veya username zaten var mı kontrol et
        check = supabase.table("users").select("id").or_(
            f"email.eq.{payload.email},username.eq.{payload.username}"
        ).execute()
        
        if check.data:
            raise HTTPException(
                status_code=400,
                detail="Email or username already taken"
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Check user error: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    # Password'ü hashle
    hashed_password = hash_password(payload.password)

    # Yeni kullanıcı oluştur
    try:
        response = supabase.table("users").insert({
            "username": payload.username,
            "email": payload.email,
            "password": hashed_password,
            "provider": "local",  # Google değil, local
            "provider_user_id": None  # Local auth için gerek yok
        }).execute()
        user = response.data[0]
        print(f"✅ New local user created: {user['id']}")
    except Exception as e:
        print(f"DEBUG: User creation error: {e}")
        raise HTTPException(status_code=500, detail="Could not create user")

    # JWT token oluştur
    token = create_jwt(user)

    return {
        "message": "User registered successfully",
        "user_id": str(user["id"]),
        "access_token": token,
        "token_type": "bearer"
    }

@router.post("/login", response_model=AuthOut)
def login_user(
    payload: LoginIn,
    supabase: Client = Depends(get_supabase)
):
    """
    Local login (email + password)
    
    ✅ YENİ ENDPOINT
    """
    try:
        # Kullanıcıyı email ile bul (sadece local provider)
        response = supabase.table("users").select("*").eq(
            "email", payload.email
        ).eq("provider", "local").execute()
        
        if not response.data:
            raise HTTPException(
                status_code=401, 
                detail="Invalid email or password"
            )
        
        user = response.data[0]
        
        # Password'ü kontrol et
        hashed_password = hash_password(payload.password)

        if hashed_password != user.get("password"):
            raise HTTPException(
                status_code=401, 
                detail="Invalid email or password"
            )
        
        print(f"✅ Local user logged in: {user['id']}")
        
        # JWT token oluştur
        token = create_jwt(user)
        
        return AuthOut(
            access_token=token,
            user_id=str(user['id']),
            email=user.get('email'),
            username=user.get('username')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

# ==========================================
# USER INFO ROUTES
# ==========================================

@router.post("/set-username")
def set_username(
    payload: SetUsernameIn,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Kullanıcının username'ini güncelle
    """
    try:
        # Username'in benzersiz olup olmadığını kontrol et
        check = supabase.table('users').select("id").eq(
            'username', payload.username
        ).execute()
        
        if check.data and check.data[0]['id'] != current_user['sub']:
            raise HTTPException(
                status_code=400, 
                detail="Username already taken"
            )
        
        # Username'i güncelle
        response = supabase.table('users').update({
            'username': payload.username
        }).eq('id', current_user['sub']).execute()
        
        return {"message": "Username updated", "username": payload.username}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Set username error: {e}")
        raise HTTPException(status_code=500, detail="Could not update username")

@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase)
):
    """
    Mevcut kullanıcının bilgilerini getir
    """
    try:
        response = supabase.table('users').select("*").eq(
            'id', current_user['sub']
        ).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = response.data[0]
        return {
            "user_id": user['id'],
            "email": user.get('email'),
            "username": user.get('username'),
            "provider": user.get('provider')
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Get me error: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch user")