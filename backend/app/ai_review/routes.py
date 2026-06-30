from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
import aiofiles
from app.ai_review.models import review_model
from app.ai_review.engine import analyze_code
from app.auth.utils import get_current_user
from app.database import get_db
from app.collaboration.models import activity_model

router = APIRouter()

def str_id(obj):
    obj["id"] = str(obj["_id"])
    del obj["_id"]
    return obj

@router.post("/analyze/{file_id}")
async def analyze_file(file_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()

    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        async with aiofiles.open(file["file_path"], "r", encoding="utf-8") as f:
            code = await f.read()
    except Exception:
        raise HTTPException(status_code=500, detail="Could not read file")

    try:
        result = analyze_code(code, file["file_type"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI review failed: {str(e)}")

    lines_count = len(code.splitlines())

    review = review_model(
        file_id=file_id,
        project_id=file["project_id"],
        reviewed_by=str(current_user["_id"]),
        reviewed_by_name=current_user["username"],
        review_result=result
    )
    review["lines_analyzed"] = lines_count

    saved = await db["reviews"].insert_one(review)

    await db["files"].update_one(
        {"_id": ObjectId(file_id)},
        {"$set": {"last_review_id": str(saved.inserted_id)}}
    )

    # Log activity
    activity = activity_model(
        project_id=file["project_id"],
        user_id=str(current_user["_id"]),
        username=current_user["username"],
        action="ran AI review",
        details=file["original_name"]
    )
    await db["activities"].insert_one(activity)

    return {
        "message": "Review complete",
        "review_id": str(saved.inserted_id),
        "result": result
    }

@router.get("/file/{file_id}") # Get all reviews for a specific file
async def get_reviews_for_file(file_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db["reviews"].find({"file_id": file_id})
    reviews = []
    async for r in cursor:
        reviews.append(str_id(r))
    return reviews

@router.get("/project/{project_id}") # Get all reviews for a project
async def get_reviews_for_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db["reviews"].find({"project_id": project_id})
    reviews = []
    async for r in cursor:
        reviews.append(str_id(r))
    return reviews

@router.get("/{review_id}") # Get a specific review by ID
async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    review = await db["reviews"].find_one({"_id": ObjectId(review_id)})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return str_id(review)