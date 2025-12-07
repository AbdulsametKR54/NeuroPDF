# app/redis_client.py
import redis
from .config import settings

redis_client = None

try:
    # Redis bağlantısı oluştur
    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=0,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        # Bağlantı havuzu ayarları
        max_connections=10,
        retry_on_timeout=True
    )
    
    # Bağlantıyı test et
    redis_client.ping()
    print("✅ Redis connection successful!")
    print(f"✅ Redis info: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    
except redis.exceptions.ConnectionError as e:
    print(f"❌ Redis connection failed: {e}")
    print(f"❌ Trying to connect to: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    print("⚠️  Guest user limiting will be disabled")
    redis_client = None
except Exception as e:
    print(f"❌ Redis error: {e}")
    redis_client = None


def get_redis() -> redis.Redis:
    """Redis client dependency"""
    if redis_client is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Redis service unavailable")
    return redis_client


def test_redis_connection():
    """Redis bağlantısını test et (debug için)"""
    if redis_client:
        try:
            info = redis_client.info()
            print(f"✅ Redis version: {info.get('redis_version')}")
            print(f"✅ Connected clients: {info.get('connected_clients')}")
            return True
        except Exception as e:
            print(f"❌ Redis test failed: {e}")
            return False
    else:
        print("❌ Redis client not initialized")
        return False


# Başlangıçta test et
if redis_client:
    test_redis_connection()