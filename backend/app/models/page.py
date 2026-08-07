from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database.base import Base

class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    url = Column(String, index=True)
    title = Column(String, nullable=True)
    http_status = Column(Integer, nullable=True)
    word_count = Column(Integer, default=0)
    detected_language = Column(String, nullable=True)
    html_content = Column(Text, nullable=True)
    error_message = Column(String, nullable=True)
    is_selected = Column(Boolean, default=True)
    translation_status = Column(String, default="pending")
    crawl_timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="pages")
    segments = relationship("TranslationSegment", back_populates="page", cascade="all, delete-orphan")



