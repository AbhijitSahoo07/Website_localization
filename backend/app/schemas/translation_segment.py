from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TranslationSegmentResponse(BaseModel):
    id: int
    page_id: int
    source_text: str
    source_language: str
    translated_text: Optional[str]
    target_language: str
    selector: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TranslationSegmentUpdate(BaseModel):
    translated_text: str
