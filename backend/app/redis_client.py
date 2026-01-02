# app/redis_client.py
import redis
import logging
from .config import settings

logger = logging.getLogger(__name__)

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
    logger.info("Redis connection successful!")
    logger.info(f"Redis info: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    
except redis.exceptions.ConnectionError as e:
    logger.warning(f"Redis connection failed: {e}")
    logger.warning(f"Trying to connect to: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    logger.warning("Guest user limiting will be disabled")
    redis_client = None
except Exception as e:
    logger.error(f"Redis error: {e}", exc_info=True)
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
            logger.info(f"Redis version: {info.get('redis_version')}")
            logger.info(f"Connected clients: {info.get('connected_clients')}")
            return True
        except Exception as e:
            logger.error(f"Redis test failed: {e}", exc_info=True)
            return False
    else:
        logger.warning("Redis client not initialized")
        return False


# Başlangıçta test et
if redis_client:
    test_redis_connection()