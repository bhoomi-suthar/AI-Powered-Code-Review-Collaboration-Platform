from datetime import datetime

def user_model(username, email, hashed_password, role="user"):
    return {
        "username": username,
        "email": email,
        "password": hashed_password,
        "role": role,
        "created_at": datetime.utcnow()
    }