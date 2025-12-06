from fastapi import FastAPI
from .routers import analysis # Birazdan oluşturacağımız router

app = FastAPI(title="AI Service")

# API endpoint'lerini dahil et
app.include_router(analysis.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}