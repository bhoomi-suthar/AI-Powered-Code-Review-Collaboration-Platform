from fastapi import APIRouter, Depends
from app.auth.utils import get_current_user
from app.database import get_db

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])

    # Total projects
    total_projects = await db["projects"].count_documents({"members": user_id})

    # Total files
    total_files = await db["files"].count_documents({"uploaded_by": user_id})

    # Total reviews
    total_reviews = await db["reviews"].count_documents({"reviewed_by": user_id})

    # Total commits
    total_commits = await db["versions"].count_documents({"created_by": user_id})

    # Total messages
    total_messages = await db["messages"].count_documents({"user_id": user_id})

    # Total lines of code analyzed
    reviews_cursor = db["reviews"].find({"reviewed_by": user_id})
    total_lines = 0
    async for r in reviews_cursor:
        total_lines += r.get("lines_analyzed", 0)

    # Most common issues
    issue_counts = {}
    reviews_cursor2 = db["reviews"].find({"reviewed_by": user_id})
    async for r in reviews_cursor2:
        for issue in r.get("issues", []):
            issue_type = issue.get("type", "unknown")
            issue_counts[issue_type] = issue_counts.get(issue_type, 0) + 1

    sorted_issues = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)

    # Recent activity
    activities = []
    cursor = db["activities"].find({"user_id": user_id}).sort("created_at", -1).limit(10)
    async for a in cursor:
        a["id"] = str(a["_id"])
        del a["_id"]
        activities.append(a)

    return {
        "total_projects": total_projects,
        "total_files": total_files,
        "total_reviews": total_reviews,
        "total_commits": total_commits,
        "total_messages": total_messages,
        "total_lines_analyzed": total_lines,
        "most_common_issues": [{"type": k, "count": v} for k, v in sorted_issues],
        "recent_activity": activities
    }

@router.get("/project/{project_id}/stats")
async def get_project_stats(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()

    # Files in project
    total_files = await db["files"].count_documents({"project_id": project_id})

    # Reviews in project
    total_reviews = await db["reviews"].count_documents({"project_id": project_id})

    # Commits in project
    total_commits = await db["versions"].count_documents({"project_id": project_id})

    # Messages in project
    total_messages = await db["messages"].count_documents({"project_id": project_id})

    # Average review score
    scores = []
    reviews_cursor = db["reviews"].find({"project_id": project_id})
    async for r in reviews_cursor:
        if "score" in r:
            scores.append(r["score"])
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0

    # Issue breakdown
    issue_counts = {}
    reviews_cursor2 = db["reviews"].find({"project_id": project_id})
    async for r in reviews_cursor2:
        for issue in r.get("issues", []):
            issue_type = issue.get("type", "unknown")
            issue_counts[issue_type] = issue_counts.get(issue_type, 0) + 1

    # Recent files
    files = []
    files_cursor = db["files"].find({"project_id": project_id}).sort("created_at", -1).limit(5)
    async for f in files_cursor:
        f["id"] = str(f["_id"])
        del f["_id"]
        files.append(f)

    return {
        "project_id": project_id,
        "total_files": total_files,
        "total_reviews": total_reviews,
        "total_commits": total_commits,
        "total_messages": total_messages,
        "average_review_score": avg_score,
        "issue_breakdown": issue_counts,
        "recent_files": files
    }

@router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    db = get_db()

    # All platform stats
    total_users = await db["users"].count_documents({})
    total_projects = await db["projects"].count_documents({})
    total_files = await db["files"].count_documents({})
    total_reviews = await db["reviews"].count_documents({})

    # All users activity
    users = []
    cursor = db["users"].find({}).limit(20)
    async for u in cursor:
        user_id = str(u["_id"])
        user_projects = await db["projects"].count_documents({"members": user_id})
        user_files = await db["files"].count_documents({"uploaded_by": user_id})
        user_reviews = await db["reviews"].count_documents({"reviewed_by": user_id})
        users.append({
            "username": u["username"],
            "email": u["email"],
            "role": u["role"],
            "projects": user_projects,
            "files": user_files,
            "reviews": user_reviews
        })

    return {
        "total_users": total_users,
        "total_projects": total_projects,
        "total_files": total_files,
        "total_reviews": total_reviews,
        "user_activity": users
    }