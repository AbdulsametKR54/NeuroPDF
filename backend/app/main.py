# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, guest, files

app = FastAPI(
    title=settings.API_NAME,
    description="PDF Project API with Supabase",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Routers - tags parametresi YOK (router dosyalarında zaten var)
app.include_router(auth.router)
app.include_router(guest.router)
app.include_router(files.router)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "message": "PDF Project API is running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    from app.db import supabase
    try:
        supabase.table('users').select("id").limit(1).execute()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "api": "ok",
        "database": db_status
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )