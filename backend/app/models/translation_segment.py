from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database.base import Base

class TranslationSegment(Base):
    __tablename__ = "translation_segments"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id", ondelete="CASCADE"), nullable=False)
    source_text = Column(Text, nullable=False)
    source_language = Column(String, default="en")
    translated_text = Column(Text, nullable=True)
    target_language = Column(String, nullable=False)
    selector = Column(String, nullable=True)
    status = Column(String, default="Pending") # "Pending", "Machine Translated", "Edited", "Approved"

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    page = relationship("Page", back_populates="segments")
