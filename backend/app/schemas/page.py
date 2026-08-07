from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class PageResponse(BaseModel):
    id: int
    project_id: int
    url: str
    title: Optional[str]
    http_status: Optional[int]
    word_count: int
    detected_language: Optional[str]
    error_message: Optional[str]
    is_selected: bool
    translation_status: str
    page_type: str
    crawl_issues: List[str]
    crawl_timestamp: datetime

    class Config:
        from_attributes = True

