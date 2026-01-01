from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GEMINI_API_KEY: str
    REDIS_URL: str = "redis://localhost:6379"
    # API Key for internal service authentication (optional, defaults to empty = no auth in dev)
    AI_SERVICE_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()