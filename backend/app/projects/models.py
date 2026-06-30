from datetime import datetime

def project_model(name, description, owner_id, owner_name):
    return {
        "name": name,
        "description": description,
        "owner_id": owner_id,
        "owner_name": owner_name,
        "members": [owner_id],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }