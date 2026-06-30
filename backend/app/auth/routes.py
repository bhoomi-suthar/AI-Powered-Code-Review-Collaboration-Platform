from fastapi import APIRouter, HTTPException, Depends # Before running Verify token
from app.auth.schemas import RegisterSchema, LoginSchema, TokenSchema
from app.auth.models import user_model
from app.auth.utils import hash_password, verify_password, create_token, get_current_user
from app.database import get_db

router = APIRouter()

@router.post("/register")
async def register(data: RegisterSchema):
    db = get_db()

    existing = await db["users"].find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check if superuser already exists
    if data.role == "superuser":
        existing_superuser = await db["users"].find_one({"role": "superuser"})
        if existing_superuser:
            raise HTTPException(
                status_code=400,
                detail="Super User already exists"
            )

    hashed = hash_password(data.password)
    user = user_model(
        data.username,
        data.email,
        hashed,
        data.role
    )

    await db["users"].insert_one(user)

    return {"message": "User registered successfully"}

@router.post("/login")
async def login(data: LoginSchema):
    db = get_db()
    user = await db["users"].find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token({"sub": user["email"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"],
        "user_id": str(user["_id"]) 
    }

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "email":    current_user["email"],
        "role":     current_user["role"]
    }


@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])

    total_projects = await db["projects"].count_documents({"owner_id": user_id})
    total_files    = await db["files"].count_documents({"uploaded_by": user_id})
    total_reviews  = await db["reviews"].count_documents({"reviewed_by": user_id})
    total_commits  = await db["versions"].count_documents({"created_by": user_id})

    return {
        "username": current_user["username"],
        "email":    current_user["email"],
        "role":     current_user["role"],
        "stats": {
            "total_projects": total_projects,
            "total_files":    total_files,
            "total_reviews":  total_reviews,
            "total_commits":  total_commits
        }
    }


@router.post("/profile/username")
async def update_username(data: dict, current_user: dict = Depends(get_current_user)):
    db       = get_db()
    username = data.get("username", "").strip()

    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    existing = await db["users"].find_one({"username": username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    await db["users"].update_one(
        {"_id": current_user["_id"]},
        {"$set": {"username": username}}
    )
    return {"message": "Username updated successfully"}


@router.post("/profile/password")
async def update_password(data: dict, current_user: dict = Depends(get_current_user)):
    db               = get_db()
    current_password = data.get("current_password", "")
    new_password     = data.get("new_password", "")

    if not verify_password(current_password, current_user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    hashed = hash_password(new_password)
    await db["users"].update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password": hashed}}
    )
    return {"message": "Password changed successfully"}


@router.delete("/profile/delete")
async def delete_account(current_user: dict = Depends(get_current_user)):
    db      = get_db()
    user_id = str(current_user["_id"])

    if current_user.get("role") == "superuser":
        raise HTTPException(status_code=400, detail="Super User account cannot be self-deleted")

    # Delete user
    await db["users"].delete_one({"_id": current_user["_id"]})

    # Delete all their projects
    await db["projects"].delete_many({"owner_id": user_id})

    # Delete all their files
    await db["files"].delete_many({"uploaded_by": user_id})

    # Delete all their reviews
    await db["reviews"].delete_many({"reviewed_by": user_id})

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

    return {"message": "Account deleted successfully"}