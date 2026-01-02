import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, func, LargeBinary
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base
from pydantic import BaseModel

# ==========================================
# 1. LLM CHOICE TABLOSU (KVKK için)
# ==========================================
class LLMChoice(Base):
    __tablename__ = "llm_choices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    # İlişki: Bu LLM choice'u kullanan kullanıcılar
    users = relationship("User", back_populates="llm_choice")


# ==========================================
# 2. USER ROLE TABLOSU
# ==========================================
class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    # İlişki: Bu role sahip kullanıcılar
    users = relationship("User", back_populates="role")


# ==========================================
# 3. KULLANICI TABLOSU
# ==========================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    eula_accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # ✅ AKTİF AVATAR YOLU (Hızlı erişim için)
    active_avatar_url: Mapped[str | None] = mapped_column(String, default="static/defaults/default_avatar.png")
    
    # LLM Choice Foreign Key (KVKK için: 0=local llm, 1=cloud llm)
    llm_choice_id: Mapped[int] = mapped_column(
        ForeignKey("llm_choices.id", ondelete="RESTRICT"),
        nullable=False,
        default=0  # Default: local llm (veriler bizde kalır)
    )
    
    # User Role Foreign Key (0=default user, 1=pro user, 2=admin)
    role_id: Mapped[int] = mapped_column(
        ForeignKey("user_roles.id", ondelete="RESTRICT"),
        nullable=False,
        default=0  # Default: default user
    )

    # Relationships
    llm_choice = relationship("LLMChoice", back_populates="users")
    role = relationship("UserRole", back_populates="users")
    
    # Kullanıcının tüm geçmiş avatarları
    avatars = relationship("UserAvatar", back_populates="user", cascade="all, delete-orphan")

    # ✅ SADECE İLİŞKİ GÜNCELLENDİ
    stats = relationship(
        "UserStats",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    
    # Kullanıcının PDF'leri
    pdfs = relationship("PDF", back_populates="user", cascade="all, delete-orphan")


# ==========================================
# 4. KULLANICI İSTATİSTİKLERİ TABLOSU
# ==========================================
class UserStats(Base):
    __tablename__ = "user_stats"

    # users.id (varchar) ile birebir
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True
    )

    summary_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    tools_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    user = relationship("User", back_populates="stats")


# ==========================================
# 5. USER STATS RESPONSE (API)
# ==========================================
class UserStatsResponse(BaseModel):
    summary_count: int
    tools_count: int
    role: str = "Standart"


# ==========================================
# 6. MİSAFİR (GUEST) OTURUM TABLOSU
# ==========================================
class GuestSession(Base):
    __tablename__ = "guest_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    usage_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        nullable=True
    )


# ==========================================
# 7. USER AVATAR TABLOSU
# ==========================================
class UserAvatar(Base):
    __tablename__ = "user_avatars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Dosya yolu: static/profiles/{userId}/{userId}_profilepicture_{timestamp}.png
    image_path: Mapped[str] = mapped_column(String, nullable=False)
    
    # Fotoğrafın kaynağı
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )

    user = relationship("User", back_populates="avatars")


# ==========================================
# 8. PDF TABLOSU (DB'de saklanacak)
# ==========================================
class PDF(Base):
    __tablename__ = "pdfs"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # UUID string olarak saklanacak
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # PDF dosyası binary olarak saklanacak
    pdf_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    
    # Metadata (opsiyonel)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # bytes cinsinden
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    user = relationship("User", back_populates="pdfs")