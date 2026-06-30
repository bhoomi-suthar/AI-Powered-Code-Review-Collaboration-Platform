from datetime import datetime

def version_model(file_id, project_id, content, commit_message, version_number, created_by, created_by_name):
    return {
        "file_id": file_id,
        "project_id": project_id,
        "content": content,
        "commit_message": commit_message,
        "version_number": version_number,
        "created_by": created_by,
        "created_by_name": created_by_name,
        "created_at": datetime.utcnow()
    }