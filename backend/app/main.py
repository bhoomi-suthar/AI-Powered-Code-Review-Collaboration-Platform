from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import socketio
import os

from app.database import connect_db, close_db
from app.config import settings
from app.auth.routes import router as auth_router
from app.projects.routes import router as projects_router
from app.files.routes import router as files_router
from app.ai_review.routes import router as review_router
from app.collaboration.routes import router as collab_router
from app.versions.routes import router as versions_router
from app.dashboard.routes import router as dashboard_router
from app.collaboration.socket_manager import sio
from app.superuser import routes as superuser_routes
from app.chatboard import routes as chatboard_routes

app = FastAPI(title="AI Code Review Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await connect_db()
    os.makedirs(settings.UPLOAD_FOLDER, exist_ok=True)
    print("Server started successfully")

@app.on_event("shutdown")
async def shutdown():
    await close_db()

app.include_router(auth_router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(projects_router,  prefix="/api/projects",  tags=["Projects"])
app.include_router(files_router,     prefix="/api/files",     tags=["Files"])
app.include_router(review_router,    prefix="/api/review",    tags=["AI Review"])
app.include_router(collab_router,    prefix="/api/collab",    tags=["Collaboration"])
app.include_router(versions_router,  prefix="/api/versions",  tags=["Versions"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(superuser_routes.router, prefix="/api/superuser")
app.include_router(chatboard_routes.router, prefix="/api/chatboard")


@app.get("/")
async def root():
    return RedirectResponse(url="/register.html")

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

app = socketio.ASGIApp(sio, app)