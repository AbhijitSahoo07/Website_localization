from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class PublishVersionResponse(BaseModel):
    id: int
    project_id: int
    version: int
    status: str
    total_segments: int
    published_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class PublishStatusResponse(BaseModel):
    is_published: bool
    current_version: Optional[int] = None
    published_at: Optional[datetime] = None
    total_approved: int
    total_segments: int
    project_id: int


class RuntimeTranslation(BaseModel):
    selector: str
    original: str
    translated: str


class RuntimePayload(BaseModel):
    project_id: int
    version: int
    target_language: str
    translations: List[RuntimeTranslation]
