from fastapi import FastAPI
from .routers import analysis  # senin /api/v1/ai routerın

app = FastAPI(title="AI Service")

app.include_router(analysis.router)

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "aiService",
        "docs": "/docs",
        "health": "/api/v1/ai/health",
    }
