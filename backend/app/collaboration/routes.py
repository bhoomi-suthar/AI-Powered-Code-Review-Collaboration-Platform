from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from datetime import datetime
from app.collaboration.models import message_model, comment_model, activity_model
from app.collaboration.schemas import MessageSchema, CommentSchema, ActivitySchema
from app.auth.utils import get_current_user
from app.database import get_db
from app.collaboration.socket_manager import sio

router = APIRouter()

def str_id(obj):
    obj["id"] = str(obj["_id"])
    del obj["_id"]
    return obj

# Save message to MongoDB
@router.post("/message/{project_id}")
async def send_message(project_id: str, data: MessageSchema, current_user: dict = Depends(get_current_user)):
    db = get_db()
    msg = message_model(
        project_id=project_id,
        user_id=str(current_user["_id"]),
        username=current_user["username"],
        message=data.message
    )
    result = await db["messages"].insert_one(msg)
    return {"message": "Message sent", "id": str(result.inserted_id)}

# Get all messages for a project
@router.get("/messages/{project_id}")
async def get_messages(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])

    # Check if user has cleared chat — only show messages after that time
    clear_record = await db["chat_clears"].find_one({
        "project_id": project_id,
        "user_id": user_id
    })

    query = {"project_id": project_id}
    if clear_record:
        query["created_at"] = {"$gt": clear_record["cleared_at"]}

    cursor = db["messages"].find(query).sort("created_at", 1)
    messages = []
    async for m in cursor:
        messages.append(str_id(m))
    return messages

# Clear all messages
@router.post("/messages/clear/{project_id}")
async def clear_messages(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])

    # Save the clear timestamp for this user
    await db["chat_clears"].update_one(
        {"project_id": project_id, "user_id": user_id},
        {"$set": {"cleared_at": datetime.utcnow()}},
        upsert=True
    )
    return {"message": "Chat cleared for you"}

# Add comment to file
@router.post("/comment/{file_id}")
async def add_comment(file_id: str, data: CommentSchema, current_user: dict = Depends(get_current_user)):
    db = get_db()
    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    comment = comment_model(
        file_id=file_id,
        project_id=file["project_id"],
        user_id=str(current_user["_id"]),
        username=current_user["username"],
        comment=data.comment,
        line_number=data.line_number
    )
    result = await db["comments"].insert_one(comment)

    await sio.emit("notification", {
        "type": "comment",
        "message": f"{current_user['username']} commented on a file",
        "username": current_user["username"]
    }, room=file["project_id"])

    return {"message": "Comment added", "id": str(result.inserted_id)}

# Get comments for a file
@router.get("/comments/{file_id}")
async def get_comments(file_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db["comments"].find({"file_id": file_id}).sort("created_at", 1)
    comments = []
    async for c in cursor:
        comments.append(str_id(c))
    return comments

# Log activity
@router.post("/activity/{project_id}")
async def log_activity(project_id: str, data: ActivitySchema, current_user: dict = Depends(get_current_user)):
    db = get_db()
    activity = activity_model(
        project_id=project_id,
        user_id=str(current_user["_id"]),
        username=current_user["username"],
        action=data.action,
        details=data.details
    )
    await db["activities"].insert_one(activity)
    await sio.emit("activity", {
        "username": current_user["username"],
        "action": data.action,
        "details": data.details
    }, room=project_id)
    return {"message": "Activity logged"}

# Get activity feed
@router.get("/activity/{project_id}")
async def get_activity(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db["activities"].find({"project_id": project_id}).sort("created_at", -1).limit(50)
    activities = []
    async for a in cursor:
        activities.append(str_id(a))
    return activities


@router.post("/messages/pin/{message_id}")
async def pin_message(message_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    msg = await db["messages"].find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    await db["messages"].update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"pinned": True}}
    )
    return {"message": "Message pinned"}


@router.post("/messages/unpin/{message_id}")
async def unpin_message(message_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db["messages"].update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"pinned": False}}
    )
    return {"message": "Message unpinned"}


@router.get("/messages/pinned/{project_id}")
async def get_pinned_messages(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db["messages"].find({"project_id": project_id, "pinned": True})
    messages = []
    async for m in cursor:
        messages.append(str_id(m))
    return messages