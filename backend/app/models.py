from datetime import datetime
import uuid
from sqlalchemy import UUID, Column, DateTime, Integer, String, TIMESTAMP, func, text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    eula_accepted: Mapped[bool] = mapped_column(default=False, nullable=False)

class GuestSession(Base):
    __tablename__ = "guest_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usage_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), onupdate=func.now())