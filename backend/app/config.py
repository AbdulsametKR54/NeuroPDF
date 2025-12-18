from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # API Configuration
    API_NAME: str = "PDF Project API"
    FRONTEND_ORIGIN: str = "http://localhost:3000"

    # JWT Configuration
    JWT_SECRET: str
    JWT_EXPIRES_MIN: int = 60

    # Google OAuth
    GOOGLE_CLIENT_ID: str

    # Supabase Configuration
    SUPABASE_URL: str
    SUPABASE_KEY: str

    # Guest User Limits
    MAX_GUEST_USAGE: int = 3

    # File Size Limits (MB) - YENİ EKLENDİ
    MAX_FILE_SIZE_GUEST_MB: int = 5
    MAX_FILE_SIZE_USER_MB: int = 7

    # Redis Configuration
    REDIS_URL: Optional[str] = None  # Docker'dan gelir: redis://redis_cache:6379
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # AI Service
    # AI_SERVICE_URL: str = "http://aiservice:8001"
    AI_SERVICE_URL: str = "http://localhost:8001"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Eğer REDIS_URL varsa, HOST ve PORT'u oradan parse et
        if self.REDIS_URL and self.REDIS_URL.startswith("redis://"):
            try:
                url = self.REDIS_URL.replace("redis://", "")
                if ":" in url:
                    host, port_part = url.split(":", 1)
                    port = int(port_part.split("/")[0])
                    self.REDIS_HOST = host
                    self.REDIS_PORT = port
                    print(f"✅ Redis config parsed from URL: {self.REDIS_HOST}:{self.REDIS_PORT}")
            except Exception as e:
                print(f"⚠️  Could not parse REDIS_URL, using defaults: {e}")

    # Pydantic Settings
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

# Settings instance
settings = Settings()

# Debug output
print("=" * 60)
print("📋 Backend Configuration:")
print(f"   API_NAME: {settings.API_NAME}")
print(f"   REDIS_HOST: {settings.REDIS_HOST}")
print(f"   REDIS_PORT: {settings.REDIS_PORT}")
print(f"   AI_SERVICE_URL: {settings.AI_SERVICE_URL}")
print(f"   MAX_GUEST_USAGE: {settings.MAX_GUEST_USAGE}")
print(f"   LIMIT (GUEST): {settings.MAX_FILE_SIZE_GUEST_MB} MB") # YENİ
print(f"   LIMIT (USER): {settings.MAX_FILE_SIZE_USER_MB} MB")   # YENİ
print("=" * 60)