from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
# --- DEĞİŞİKLİK: 'guest' router'ı buraya import edildi ---
from app.routers import auth, guest

app = FastAPI(title=settings.API_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(guest.router)
