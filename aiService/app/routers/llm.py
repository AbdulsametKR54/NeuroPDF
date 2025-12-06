from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.llm_manager import analyze_text_with_ai

router = APIRouter()

# Frontend'den gelecek verinin şablonu
class AnalyzeRequest(BaseModel):
    text: str

@router.post("/analyze")
async def analyze_text(request: AnalyzeRequest):
    """
    Verilen metni Llama 3.2 ile analiz eder.
    """
    result = analyze_text_with_ai(request.text)
    
    if not result:
        raise HTTPException(status_code=500, detail="Yapay zeka servisine ulaşılamadı.")
    
    return {"status": "success", "analysis": result}