from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    API_NAME: str = "PDF AI Backend"
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    JWT_SECRET: str = "dev_secret"
    JWT_EXPIRES_MIN: int = 60
    GOOGLE_CLIENT_ID: str = ""

    DATABASE_URL: str = (
        "postgresql+psycopg://app_user:S3curePass!@db:5432/app_db" # <-- NOT: 'localhost' yerine docker servis adı 'db' kullanıldı
    )

    # <-- YENİ EKLENEN KISIM BAŞLANGICI -->
    REDIS_HOST: str = "redis-cache" # docker-compose'daki servis adı
    REDIS_PORT: int = 6379
    # <-- YENİ EKLENEN KISIM SONU -->

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

settings = Settings()