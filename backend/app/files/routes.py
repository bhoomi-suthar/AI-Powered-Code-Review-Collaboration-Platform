from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from bson import ObjectId
import os
import uuid
import aiofiles
from datetime import datetime
from app.files.models import file_model
from app.auth.utils import get_current_user
from app.database import get_db
from app.config import settings
from app.collaboration.models import activity_model

router = APIRouter()

ALLOWED_EXTENSIONS = {
    "py", "js", "java", "cpp", "c", "ts",
    "html", "css", "go", "rb", "php", "cs"
}

def str_id(obj):
    obj["id"] = str(obj["_id"])
    del obj["_id"]
    return obj

def get_extension(filename: str) -> str: # get file extension
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

@router.post("/upload/{project_id}")
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()

    project = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ext = get_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not allowed")

    unique_name = f"{uuid.uuid4().hex}.{ext}"
    folder = os.path.join(settings.UPLOAD_FOLDER, project_id)
    os.makedirs(folder, exist_ok=True)
    file_path = os.path.join(folder, unique_name)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    file_doc = file_model(
        filename=unique_name,
        original_name=file.filename,
        file_path=file_path,
        file_type=ext,
        size=len(content),
        project_id=project_id,
        uploaded_by=str(current_user["_id"]),
        uploaded_by_name=current_user["username"]
    )
    result = await db["files"].insert_one(file_doc)

    await db["projects"].update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"updated_at": datetime.utcnow()}}
    )

    # Log activity
    activity = activity_model(
        project_id=project_id,
        user_id=str(current_user["_id"]),
        username=current_user["username"],
        action="uploaded file",
        details=file.filename
    )
    await db["activities"].insert_one(activity)

    # Auto index in Pinecone
    try:
        from app.chatboard.pinecone_helper import store_file_chunks
        with open(file_path, "r", encoding="utf-8") as f:
            file_content = f.read()
        store_file_chunks(str(result.inserted_id), file_content)
    except Exception as e:
        print(f"Pinecone indexing failed: {e}")

    return {
        "message": "File uploaded successfully",
        "file_id": str(result.inserted_id),
        "filename": file.filename
    }

@router.get("/project/{project_id}")  # get all files for a project
async def get_project_files(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db["files"].find({"project_id": project_id})
    files = []
    async for f in cursor:
        files.append(str_id(f))
    return files

@router.get("/content/{file_id}")
async def get_file_content(file_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    async with aiofiles.open(file["file_path"], "r", encoding="utf-8") as f:
        content = await f.read()

    return {"filename": file["original_name"], "content": content, "file_type": file["file_type"]}

@router.get("/{file_id}") # specific file metadata
async def get_file(file_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return str_id(file)

@router.delete("/{file_id}")
async def delete_file(file_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    if os.path.exists(file["file_path"]):
        os.remove(file["file_path"])

    await db["files"].delete_one({"_id": ObjectId(file_id)})
    return {"message": "File deleted"}


@router.put("/update/{file_id}")
async def update_file(
    file_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    existing_file = await db["files"].find_one(
        {"_id": ObjectId(file_id)}
    )
    if not existing_file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )
    async with aiofiles.open( # overwrite existing file
        existing_file["file_path"],
        "wb"
    ) as f:
        content = await file.read()
        await f.write(content)

    return {
        "message": "File updated successfully"
    }