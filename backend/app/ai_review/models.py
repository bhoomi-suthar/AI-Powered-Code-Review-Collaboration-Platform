from datetime import datetime

def review_model(file_id, project_id, reviewed_by, reviewed_by_name, review_result):
    return {
        "file_id": file_id,
        "project_id": project_id,
        "reviewed_by": reviewed_by,
        "reviewed_by_name": reviewed_by_name,
        "issues": review_result.get("issues", []),
        "suggestions": review_result.get("suggestions", []),
        "documentation": review_result.get("documentation", ""),
        "summary": review_result.get("summary", ""),
        "score": review_result.get("score", 0),
        "created_at": datetime.utcnow()
    }