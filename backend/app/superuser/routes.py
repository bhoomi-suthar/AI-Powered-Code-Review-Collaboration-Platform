from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from app.auth.utils import get_current_user
from app.database import get_db

router = APIRouter()

def str_id(obj):
    obj["id"] = str(obj["_id"])
    del obj["_id"]
    return obj

def superuser_only(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "superuser":
        raise HTTPException(status_code=403, detail="Super User access only")
    return current_user

@router.get("/stats")
async def get_stats(current_user: dict = Depends(superuser_only)):
    db = get_db()
    return {
        "total_users":    await db["users"].count_documents({}),
        "total_projects": await db["projects"].count_documents({}),
        "total_files":    await db["files"].count_documents({}),
        "total_reviews":  await db["reviews"].count_documents({})
    }

@router.get("/users")
async def get_all_users(current_user: dict = Depends(superuser_only)):
    db = get_db()
    cursor = db["users"].find({})
    users  = []
    async for u in cursor:
        u.pop("password", None)
        users.append(str_id(u))
    return users

@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(superuser_only)):
    db = get_db()
    if user_id == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    # Delete user
    await db["users"].delete_one({"_id": ObjectId(user_id)})

    # Delete all their projects
    await db["projects"].delete_many({"owner_id": user_id})

    # Delete all their files
    await db["files"].delete_many({"uploaded_by": user_id})

    # Delete all their reviews
    await db["reviews"].delete_many({"user_id": user_id})

    # Delete all their activities
    await db["activities"].delete_many({"user_id": user_id})

    # Remove from collaborators in other projects
    await db["projects"].update_many(
        {},
        {
            "$pull": {"members": user_id, "pending_members": {"user_id": user_id}},
            "$unset": {f"member_roles.{user_id}": ""}
        }
    )

    return {"message": f"User and all their data deleted successfully"}

@router.post("/users/{user_id}/role")
async def update_user_role(user_id: str, data: dict, current_user: dict = Depends(superuser_only)):
    db      = get_db()
    new_role = data.get("role")
    if new_role not in ["user", "admin", "superuser"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    await db["users"].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"role": new_role}}
    )
    return {"message": f"Role updated to {new_role}"}

@router.get("/projects")
async def get_all_projects(current_user: dict = Depends(superuser_only)):
    db       = get_db()
    cursor   = db["projects"].find({})
    projects = []
    async for p in cursor:
        projects.append(str_id(p))
    return projects

@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, current_user: dict = Depends(superuser_only)):
    db = get_db()
    await db["projects"].delete_one({"_id": ObjectId(project_id)})
    return {"message": "Project deleted"}