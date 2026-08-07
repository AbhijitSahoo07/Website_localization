import sys
import asyncio

if sys.platform == "win32":
    # Playwright requires subprocess support, which is only available in ProactorEventLoop on Windows
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.core.config import settings

from app.database.session import engine
from app.database import base
from app.api import endpoints

from sqlalchemy import text
import os

# Initialize database tables
base.Base.metadata.create_all(bind=engine)

# Check and execute SQLite schema migrations (preserves existing data)
try:
    with engine.begin() as conn:
        # Migrate pages table
        res_pages = conn.execute(text("PRAGMA table_info(pages)"))
        cols_pages = [r[1] for r in res_pages.fetchall()]
        if "is_selected" not in cols_pages:
            conn.execute(text("ALTER TABLE pages ADD COLUMN is_selected BOOLEAN DEFAULT 1"))
        if "translation_status" not in cols_pages:
            conn.execute(text("ALTER TABLE pages ADD COLUMN translation_status VARCHAR DEFAULT 'pending'"))
            
        # Migrate projects table
        res_projects = conn.execute(text("PRAGMA table_info(projects)"))
        cols_projects = [r[1] for r in res_projects.fetchall()]
        if "max_pages" not in cols_projects:
            conn.execute(text("ALTER TABLE projects ADD COLUMN max_pages INTEGER DEFAULT 50"))
        if "max_depth" not in cols_projects:
            conn.execute(text("ALTER TABLE projects ADD COLUMN max_depth INTEGER DEFAULT 3"))
            
        # Migrate translation_segments table
        res_segs = conn.execute(text("PRAGMA table_info(translation_segments)"))
        cols_segs = [r[1] for r in res_segs.fetchall()]
        if cols_segs and "source_language" not in cols_segs:
            conn.execute(text("ALTER TABLE translation_segments ADD COLUMN source_language VARCHAR DEFAULT 'en'"))
except Exception as e:
    print(f"SQLite migration failed (can be ignored if fresh db): {e}")




app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# ─── CORS ──────────────────────────────────────────────────────────────────────
# Frontend (localhost:3000) gets full access.
# /api/projects/*/runtime is also accessible from any origin (customer websites embed loc.js)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # loc.js is loaded on customer sites — must allow all origins
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Website Localization Automation Tool API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

app.include_router(endpoints.router, prefix="/api")

# ─── Serve loc.js as a static file at /runtime/loc.js ─────────────────────────
_runtime_dir = os.path.join(os.path.dirname(__file__), "runtime")
if os.path.isdir(_runtime_dir):
    app.mount("/runtime", StaticFiles(directory=_runtime_dir), name="runtime")
