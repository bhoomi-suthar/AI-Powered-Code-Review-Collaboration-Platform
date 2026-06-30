from datetime import datetime

def message_model(project_id, user_id, username, message):
    return {
        "project_id": project_id,
        "user_id": user_id,
        "username": username,
        "message": message,
        "created_at": datetime.utcnow()
    }

def comment_model(file_id, project_id, user_id, username, comment, line_number=None):
    return {
        "file_id": file_id,
        "project_id": project_id,
        "user_id": user_id,
        "username": username,
        "comment": comment,
        "line_number": line_number,
        "created_at": datetime.utcnow()
    }

def activity_model(project_id, user_id, username, action, details=""):
    return {
        "project_id": project_id,
        "user_id": user_id,
        "username": username,
        "action": action,
        "details": details,
        "created_at": datetime.utcnow()
    }