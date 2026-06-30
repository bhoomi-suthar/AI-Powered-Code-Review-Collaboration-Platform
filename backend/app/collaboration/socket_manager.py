import socketio

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"
)

@sio.event
async def connect(sid, environ):
    print(f"User connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"User disconnected: {sid}")

@sio.event
async def join_project(sid, data):
    project_id = data.get("project_id")
    username   = data.get("username", "Anonymous")
    await sio.enter_room(sid, project_id)
    print(f"{username} joined room: {project_id}")

@sio.event
async def leave_project(sid, data):
    project_id = data.get("project_id")
    username   = data.get("username", "Anonymous")
    await sio.leave_room(sid, project_id)

@sio.event
async def send_message(sid, data):
    project_id   = data.get("project_id")
    project_name = data.get("project_name", "")
    print(f"Message in room {project_id}: {data.get('message')}")
    await sio.emit("receive_message", { # broadcast to all in the project room
        "username":     data.get("username"),
        "message":      data.get("message"),
        "timestamp":    data.get("timestamp"),
        "project_name": project_name,
        "sender_sid":   sid
    }, room=project_id)

@sio.event
async def send_notification(sid, data):
    project_id = data.get("project_id")
    await sio.emit("notification", {
        "type":     data.get("type"),
        "message":  data.get("message"),
        "username": data.get("username")
    }, room=project_id)

@sio.event
async def message_pinned(sid, data):
    project_id = data.get("project_id")

    await sio.emit(
        "refresh_chat",
        {},
        room=project_id
    )


@sio.event
async def message_unpinned(sid, data):
    project_id = data.get("project_id")

    await sio.emit(
        "refresh_chat",
        {},
        room=project_id
    )
