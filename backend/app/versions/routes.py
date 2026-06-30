from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
import aiofiles 
from app.versions.models import version_model
from app.versions.schemas import CommitSchema, RollbackSchema
from app.auth.utils import get_current_user
from app.database import get_db
import difflib # for comparing versions 

router = APIRouter()

def str_id(obj):
    obj["id"] = str(obj["_id"])
    del obj["_id"]
    return obj

@router.post("/commit/{file_id}")
async def commit_file(file_id: str, data: CommitSchema, current_user: dict = Depends(get_current_user)):
    db = get_db()

    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    async with aiofiles.open(file["file_path"], "r", encoding="utf-8") as f:
        content = await f.read()

    count          = await db["versions"].count_documents({"file_id": file_id})
    version_number = count + 1

    version = version_model(
        file_id=file_id,
        project_id=file["project_id"],
        content=content,
        commit_message=data.commit_message,
        version_number=version_number,
        created_by=str(current_user["_id"]),
        created_by_name=current_user["username"]
    )
    result = await db["versions"].insert_one(version)

    # Push to GitHub
    github_url = await push_to_github(
        filename=file["original_name"],
        content=content,
        commit_message=f"{data.commit_message} - by {current_user['username']}",
        project_id=file["project_id"],
        version_number=version_number
    )

    return {
        "message": "Commit saved",
        "version_id": str(result.inserted_id),
        "version_number": version_number,
        "github_url": github_url
    }


async def push_to_github(filename: str, content: str, commit_message: str, project_id: str, version_number: int):
    import requests
    import base64
    from app.config import settings
    from app.database import get_db
    from bson import ObjectId

    if not settings.GITHUB_TOKEN:
        return None

    db = get_db()
    project = await db["projects"].find_one({"_id": ObjectId(project_id)})

    if not project or not project.get("github_repo"):
        return None

    # Extract owner/repo from github_repo URL
    github_repo = project["github_repo"].replace("https://github.com/", "")

    headers = {
        "Authorization": f"token {settings.GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }

    github_path = f"{filename}"
    api_url     = f"https://api.github.com/repos/{github_repo}/contents/{github_path}"

    sha = None
    check = requests.get(api_url, headers=headers)
    if check.status_code == 200:
        sha = check.json().get("sha")

    encoded = base64.b64encode(content.encode()).decode()

    body = {
        "message": commit_message,
        "content": encoded
    }
    if sha:
        body["sha"] = sha

    response = requests.put(api_url, json=body, headers=headers)

    if response.status_code in [200, 201]:
        return response.json().get("content", {}).get("html_url")

    return None


@router.get("/history/{file_id}") # retrieves all saved versions of a specific file
async def get_history(file_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db["versions"].find({"file_id": file_id}).sort("version_number", 1)
    versions = []
    async for v in cursor:
        v["id"] = str(v["_id"]) # Convert ObjectId to string
        del v["_id"]
        del v["content"]
        versions.append(v)
    return versions

@router.get("/compare/{file_id}")
async def compare_versions(file_id: str, v1: int, v2: int, current_user: dict = Depends(get_current_user)):
    db = get_db()

    version1 = await db["versions"].find_one({"file_id": file_id, "version_number": v1})
    version2 = await db["versions"].find_one({"file_id": file_id, "version_number": v2})

    if not version1 or not version2:
        raise HTTPException(status_code=404, detail="Version not found")

    diff = list(difflib.unified_diff(
        version1["content"].splitlines(),
        version2["content"].splitlines(),
        fromfile=f"version {v1}",
        tofile=f"version {v2}",
        lineterm=""
    ))

    return {
        "version1": v1,
        "version2": v2,
        "diff": diff
    }

@router.post("/rollback/{file_id}")
async def rollback(file_id: str, data: RollbackSchema, current_user: dict = Depends(get_current_user)):
    db = get_db()

    # Get the version to rollback to
    version = await db["versions"].find_one({"_id": ObjectId(data.version_id)})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Get file
    file = await db["files"].find_one({"_id": ObjectId(file_id)})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # Write old content back to file
    async with aiofiles.open(file["file_path"], "w", encoding="utf-8") as f:
        await f.write(version["content"])

    return {
        "message": f"Rolled back to version {version['version_number']}",
        "version_number": version["version_number"]
    }