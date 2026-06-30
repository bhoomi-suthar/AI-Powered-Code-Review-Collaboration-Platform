from datetime import datetime

def file_model(filename, original_name, file_path, file_type, size, project_id, uploaded_by, uploaded_by_name):
    return {
        "filename": filename,
        "original_name": original_name,
        "file_path": file_path,
        "file_type": file_type,
        "size": size,
        "project_id": project_id,
        "uploaded_by": uploaded_by,
        "uploaded_by_name": uploaded_by_name,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }