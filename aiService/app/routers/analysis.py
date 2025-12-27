from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..tasks import pdf_tasks
from ..services import ai_service, pdf_service
from ..services.tts_manager import text_to_speech
from ..services.llm_manager import CloudMode, LLMProvider, summarize_text, chat_over_pdf  # ✅

router = APIRouter(
    prefix="/api/v1/ai",
    tags=["AI Analysis"],
)

@router.post("/summarize-sync")
async def summarize_synchronous(
    file: UploadFile = File(...),
    llm_provider: LLMProvider = Query("cloud"),
    mode: CloudMode = Query("flash"),
):
    try:
        pdf_bytes = await file.read()
        text = pdf_service.extract_text_from_pdf_bytes(pdf_bytes)

        prompt = (
            "Bu PDF belgesini Türkçe olarak özetle. "
            "Ana konuları ve önemli noktaları madde madde belirt."
        )

        summary = summarize_text(text, prompt, llm_provider=llm_provider, mode=mode)

        return {
            "status": "completed",
            "summary": summary,
            "llm_provider": llm_provider,
            "mode": mode if llm_provider == "cloud" else None,
            "method": "synchronous",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Özetleme işlemi başarısız: {str(e)}")


class AsyncTaskRequest(BaseModel):
    pdf_id: int
    storage_path: str
    callback_url: str
    llm_provider: str = "cloud"
    mode: str = "pro"


@router.post("/summarize-async")
async def summarize_asynchronous(task_request: AsyncTaskRequest):
    pdf_tasks.async_summarize_pdf.delay(
        pdf_id=task_request.pdf_id,
        storage_path=task_request.storage_path,
        callback_url=task_request.callback_url,
        llm_provider=task_request.llm_provider,
        mode=task_request.mode,
    )
    return {
        "status": "processing",
        "pdf_id": task_request.pdf_id,
        "llm_provider": task_request.llm_provider,
        "mode": task_request.mode if task_request.llm_provider == "cloud" else None,
    }


class StartChatResponse(BaseModel):
    session_id: str


@router.post("/chat/start", response_model=StartChatResponse)
async def start_chat(
    file: UploadFile = File(...),
    llm_provider: LLMProvider = Query("cloud"),
    mode: CloudMode = Query("flash"),
):
    pdf_bytes = await file.read()
    text = pdf_service.extract_text_from_pdf_bytes(pdf_bytes)

    session_id = ai_service.create_pdf_chat_session(
        text,
        filename=file.filename,
        llm_provider=llm_provider,
        mode=mode,
    )
    return {"session_id": session_id}


class ChatRequest(BaseModel):
    session_id: str
    message: str
    llm_provider: str | None = None
    mode: str | None = None


@router.post("/chat")
async def chat_about_pdf(req: ChatRequest):
    try:
        ai_service._cleanup_sessions()
        session = ai_service._PDF_CHAT_SESSIONS.get(req.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Sohbet oturumu bulunamadı veya süresi dolmuş.")

        pdf_text = session["text"]
        filename = session["filename"]
        history = session["history"]

        MAX_CONTEXT_CHARS = 45000
        pdf_context = pdf_text[:MAX_CONTEXT_CHARS] if len(pdf_text) > MAX_CONTEXT_CHARS else pdf_text

        history_text = ""
        for turn in history[-10:]:
            history_text += f"{turn['role'].upper()}: {turn['content']}\n"

        llm_provider = req.llm_provider or session.get("llm_provider", "cloud")
        mode = req.mode or session.get("mode", "pro")

        answer = chat_over_pdf(
            session_text=pdf_context,
            filename=filename,
            history_text=history_text,
            user_message=req.message,
            llm_provider=llm_provider,
            mode=mode,
        )

        history.append({"role": "user", "content": req.message})
        history.append({"role": "assistant", "content": answer})

        return {
            "answer": answer,
            "llm_provider": llm_provider,
            "mode": mode if llm_provider == "cloud" else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sohbet hatası: {str(e)}")


class TTSRequest(BaseModel):
    text: str


@router.post("/tts")
async def generate_speech(request: TTSRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")

    audio_buffer = text_to_speech(request.text)
    if not audio_buffer:
        raise HTTPException(status_code=500, detail="Ses oluşturulamadı.")

    return StreamingResponse(audio_buffer, media_type="audio/mpeg")


@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ai_service",
        "endpoints": {
            "sync": "/api/v1/ai/summarize-sync",
            "async": "/api/v1/ai/summarize-async",
            "chat_start": "/api/v1/ai/chat/start",
            "chat": "/api/v1/ai/chat",
            "tts": "/api/v1/ai/tts",
        },
        "llm": {
            "providers": ["cloud", "local"],
            "cloud_modes": ["flash", "pro"],
        },
    }
