import redis
from .config import settings

redis_client = None
try:
    # Yeniden kullanılabilir bir Redis istemcisi (client) oluşturuyoruz
    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=0, # Genellikle 0. veritabanı kullanılır
        decode_responses=True # Redis'ten gelen yanıtları otomatik olarak string'e çevirir
    )
    
    # Bağlantının başarılı olup olmadığını test etmek için PING komutu gönderiyoruz
    redis_client.ping()
    print("✅ Redis connection successful!")

except redis.exceptions.ConnectionError as e:
    print(f"❌ Redis connection failed: {e}")
    # Hata durumunda uygulama çökmesin diye istemciyi None olarak bırakıyoruz
    redis_client = None
