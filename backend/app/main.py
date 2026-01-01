# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from app.config import settings
from app.routers import auth, guest, files, user_avatar_routes

# Security scheme for Swagger UI
security_scheme = HTTPBearer(
    bearerFormat="JWT",
    scheme_name="Bearer"
)

app = FastAPI(
    title=settings.API_NAME,
    description="PDF Project API with Supabase",
    version="1.0.0",
    swagger_ui_init_oauth={
        "clientId": "api-client",
        "appName": "NeuroPDF API"
    }
)

# Add security scheme to OpenAPI schema
app.openapi_schema = None

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "Bearer": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter JWT token (Bearer token from login/register endpoint)"
        }
    }
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Export security scheme for use in routers (optional)
bearer_scheme = security_scheme

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(guest.router)
app.include_router(files.router)
app.include_router(user_avatar_routes.router)


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