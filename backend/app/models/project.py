from sqlalchemy import Column, Integer, String, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
from app.database.base import Base

class ProjectStatus(str, enum.Enum):
    PENDING = "pending"
    CRAWLING = "crawling"
    COMPLETED = "completed"
    FAILED = "failed"

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    target_url = Column(String, index=True)
    target_language = Column(String)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.PENDING)
    error_message = Column(String, nullable=True)
    max_pages = Column(Integer, default=50)
    max_depth = Column(Integer, default=3)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    pages = relationship("Page", back_populates="project", cascade="all, delete-orphan")


