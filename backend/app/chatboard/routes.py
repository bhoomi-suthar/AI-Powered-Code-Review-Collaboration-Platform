from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
import aiofiles
from datetime import datetime
from app.auth.utils import get_current_user
from app.database import get_db
from app.chatboard.pinecone_helper import store_file_chunks, search_file
from app.config import settings
from groq import Groq

router  = APIRouter()
client  = Groq(api_key=settings.GROQ_API_KEY)

@router.post("/index/{file_id}")
async def index_file(file_id: str, current_user: dict = Depends(get_current_user)):
    db   = get_db()
    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    content = ""
    try:
        async with aiofiles.open(file["file_path"], "r", encoding="utf-8") as f:
            content = await f.read()
    except Exception:
        # File missing on disk (ephemeral storage wiped) — use DB backup
        content = file.get("content_backup", "")

    if not content.strip():
        raise HTTPException(status_code=404, detail="File content not available. Please re-upload the file.")

    store_file_chunks(file_id, content)

    return {"message": "File indexed successfully"}


@router.post("/ask/{file_id}")
async def ask_question(file_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    db           = get_db()
    question     = data.get("question", "").strip()
    history      = data.get("history", [])  # previous messages

    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    chunks  = search_file(file_id, question)
    context = "\n\n".join(chunks) if chunks else "No relevant content found."

    # Build messages with full history 
    messages = [ 
        {
            "role": "system",
            "content": f"""You are a code assistant for file: {file['original_name']}
Answer based ONLY on this file content. Be short and simple.
Use numbered list for steps, bullet points (•) for facts.
No markdown symbols like ** or ` in your response.

File Content:
{context}"""
        }
    ]

    # Add previous conversation 
    for msg in history:
        messages.append({
            "role":    msg["role"],
            "content": msg["content"]
        })

    # Add current question
    messages.append({
        "role":    "user",
        "content": question
    })

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=500
    )

    answer = response.choices[0].message.content.strip()
    return {"answer": answer}


@router.get("/history/{file_id}")
async def get_chat_history(file_id: str, current_user: dict = Depends(get_current_user)):
    db     = get_db()
    record = await db["chatboard_history"].find_one({
        "file_id": file_id,
        "user_id": str(current_user["_id"])
    })
    if not record:
        return {"history": [], "summary": ""}
    return {
        "history": record.get("history", []),
        "summary": record.get("summary", "")
    }


@router.post("/history/{file_id}")
async def save_chat_history(file_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db["chatboard_history"].update_one(
        {"file_id": file_id, "user_id": str(current_user["_id"])},
        {"$set": {
            "history":    data.get("history", []),
            "summary":    data.get("summary", ""),
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )
    return {"message": "Saved"}
