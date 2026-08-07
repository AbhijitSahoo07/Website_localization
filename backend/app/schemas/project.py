from pydantic import BaseModel, HttpUrl
from typing import Optional
from datetime import datetime
from app.models.project import ProjectStatus

class ProjectCreate(BaseModel):
    url: HttpUrl
    target_language: str
    name: Optional[str] = None
    max_depth: Optional[int] = 3
    max_pages: Optional[int] = 50

class ProjectResponse(BaseModel):
    id: int
    name: Optional[str]
    target_url: str
    target_language: str
    status: ProjectStatus
    error_message: Optional[str]
    max_pages: Optional[int]
    max_depth: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

