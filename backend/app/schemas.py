from pydantic import BaseModel
import uuid
from datetime import datetime

# ... diğer şemalarınız (varsa) ...

class GuestSessionOut(BaseModel):
    id: uuid.UUID
    usage_count: int
    created_at: datetime

    class Config:
        from_attributes = True # Pydantic v2'de 'orm_mode' yerine kullanılır