from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from datetime import datetime
from app.projects.schemas import CreateProjectSchema, UpdateProjectSchema
from app.projects.models import project_model
from app.auth.utils import get_current_user
from app.database import get_db
from app.collaboration.models import activity_model
from app.config import settings

router = APIRouter()

def str_id(obj):
    obj["id"] = str(obj["_id"])
    del obj["_id"]
    return obj

@router.post("/")
async def create_project(data: CreateProjectSchema, current_user: dict = Depends(get_current_user)):
    db = get_db()
    github_repo_url = await create_github_repo(data.name, data.description or "")
    project = project_model(
        name=data.name,
        description=data.description,
        owner_id=str(current_user["_id"]),
        owner_name=current_user["username"]
    )
    if github_repo_url:
        project["github_repo"] = github_repo_url
    result = await db["projects"].insert_one(project)
    project_id = str(result.inserted_id)
    activity = activity_model(
        project_id=project_id,
        user_id=str(current_user["_id"]),
        username=current_user["username"],
        action="created project",
        details=data.name
    )
    await db["activities"].insert_one(activity)
    return {"message": "Project created", "project_id": project_id, "github_repo": github_repo_url}


async def create_github_repo(name: str, description: str) -> str:
    import requests
    if not settings.GITHUB_TOKEN:
        return None
    repo_name = name.lower().replace(" ", "-").replace("_", "-")
    headers = {
        "Authorization": f"token {settings.GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    body = {"name": repo_name, "description": description, "private": False, "auto_init": True}
    response = requests.post("https://api.github.com/user/repos", json=body, headers=headers)
    if response.status_code == 201:
        return response.json().get("html_url")
    print(f"GitHub repo creation failed: {response.json()}")
    return None


@router.get("/")
async def get_all_projects(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])

    accepted = []
    cursor = db["projects"].find({"members": user_id})
    async for p in cursor:
        p["pending"] = False
        accepted.append(str_id(p))

    pending = []
    cursor2 = db["projects"].find({"pending_members.user_id": user_id})
    async for p in cursor2:
        p["pending"] = True
        pending.append(str_id(p))

    return accepted + pending


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return str_id(project)


@router.put("/{project_id}")
async def update_project(project_id: str, data: UpdateProjectSchema, current_user: dict = Depends(get_current_user)):
    db = get_db()
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    await db["projects"].update_one({"_id": ObjectId(project_id)}, {"$set": update_data})
    return {"message": "Project updated"}


@router.delete("/{project_id}")
async def delete_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db["projects"].delete_one({"_id": ObjectId(project_id)})
    return {"message": "Project deleted"}


@router.post("/{project_id}/add-collaborator")
async def add_collaborator(project_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    db = get_db()
    username = data.get("username")
    email    = data.get("email", "").strip()
    role     = data.get("role", "editor")

    user = await db["users"].find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    if user.get("email", "").lower() != email.lower():
        raise HTTPException(status_code=400, detail=f"Email does not match the user '{username}'.")

    project = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.get("owner_id") != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only project owner can add collaborators")

    user_id = str(user["_id"])
    members = project.get("members", [])

    if user_id in members:
        raise HTTPException(status_code=400, detail="User already a collaborator")

    pending = project.get("pending_members", [])
    if any(p["user_id"] == user_id for p in pending):
        raise HTTPException(status_code=400, detail="Invitation already sent to this user")

    if user_id == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="You cannot add yourself as collaborator")

    await db["projects"].update_one(
        {"_id": ObjectId(project_id)},
        {"$push": {"pending_members": {"user_id": user_id, "role": role}}}
    )

    if project.get("github_repo") and user.get("github_username"):
        import requests
        repo_path = project["github_repo"].replace("https://github.com/", "")
        headers = {
            "Authorization": f"token {settings.GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json"
        }
        github_permission = "pull" if role == "viewer" else "push"
        requests.put(
            f"https://api.github.com/repos/{repo_path}/collaborators/{user['github_username']}",
            json={"permission": github_permission},
            headers=headers
        )

    return {
        "message": f"Invitation sent to {user['username']}",
        "user_email": user["email"],
        "username": user["username"]
    }


@router.get("/{project_id}/collaborators")
async def get_collaborators(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    members      = project.get("members", [])
    member_roles = project.get("member_roles", {})
    owner_id     = project.get("owner_id", "")

    collaborators = []
    for user_id in members:
        if user_id == owner_id:
            continue
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if user:
            collaborators.append({
                "user_id":  user_id,
                "username": user["username"],
                "role":     member_roles.get(user_id, "editor")
            })
    return {"collaborators": collaborators}


@router.post("/{project_id}/remove-collaborator")
async def remove_collaborator(project_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = data.get("user_id")
    project = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("owner_id") != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only owner can remove collaborators")
    await db["projects"].update_one(
        {"_id": ObjectId(project_id)},
        {
            "$pull": {"members": user_id},
            "$unset": {f"member_roles.{user_id}": ""}
        }
    )
    return {"message": "Collaborator removed"}


@router.post("/{project_id}/update-collaborator-role")
async def update_collaborator_role(project_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id  = data.get("user_id")
    new_role = data.get("role")
    project  = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("owner_id") != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only owner can update roles")
    await db["projects"].update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {f"member_roles.{user_id}": new_role}}
    )
    return {"message": f"Role updated to {new_role}"}


@router.post("/{project_id}/accept")
async def accept_invite(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])
    project = await db["projects"].find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    pending = project.get("pending_members", [])
    invite  = next((p for p in pending if p["user_id"] == user_id), None) # Check the pending invitation
    if not invite:
        raise HTTPException(status_code=404, detail="No invitation found")
    role = invite["role"]
    await db["projects"].update_one(
        {"_id": ObjectId(project_id)},
        {
            "$push": {"members": user_id},
            "$set":  {f"member_roles.{user_id}": role},
            "$pull": {"pending_members": {"user_id": user_id}}
        }
    )
    return {"message": f"You joined the project as {role}"}


@router.post("/{project_id}/reject")
async def reject_invite(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])
    await db["projects"].update_one(
        {"_id": ObjectId(project_id)},
        {"$pull": {"pending_members": {"user_id": user_id}}}
    )
    return {"message": "Invitation rejected"}