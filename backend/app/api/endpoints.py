from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pydantic import BaseModel

from app.database.session import get_db
from app.models.project import Project, ProjectStatus
from app.models.page import Page
from app.models.translation_segment import TranslationSegment
from app.models.publish_version import PublishVersion
from app.schemas.project import ProjectCreate, ProjectResponse
from app.schemas.page import PageResponse
from app.schemas.translation_segment import TranslationSegmentResponse, TranslationSegmentUpdate
from app.schemas.publish_version import PublishVersionResponse, PublishStatusResponse, RuntimePayload, RuntimeTranslation
from app.schemas.response import APIResponse
from app.crawler.engine import crawl_project, normalize_url, is_internal_link, is_valid_page_link
from app.services.analysis import classify_page_type, analyze_crawl_issues
from app.services.translation import TranslationService, extract_segments
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()

class PageSelectionUpdate(BaseModel):
    is_selected: bool

class BulkSelectionUpdate(BaseModel):
    page_ids: List[int]
    is_selected: bool

@router.post("/projects/", response_model=APIResponse[ProjectResponse])
def create_project(
    project_in: ProjectCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    url_str = str(project_in.url)
    logger.info("API: Creating project for URL: %s", url_str)
    
    try:
        project = Project(
            name=project_in.name or url_str,
            target_url=url_str,
            target_language=project_in.target_language,
            status=ProjectStatus.PENDING,
            max_pages=project_in.max_pages,
            max_depth=project_in.max_depth
        )
        db.add(project)
        db.commit()
        db.refresh(project)
    except Exception as e:
        db.rollback()
        logger.exception("API: Failed to insert project record in DB")
        return APIResponse(success=False, message="Failed to create project", errors=[str(e)])
    
    def crawl_project_sync(project_id: int, start_url: str, max_depth: int, max_pages: int):
        import asyncio
        import sys
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        asyncio.run(crawl_project(project_id, start_url, max_depth, max_pages))

    # Start crawl in background using thread pool to get fresh event loop on Windows
    background_tasks.add_task(
        crawl_project_sync, 
        project_id=project.id, 
        start_url=url_str,
        max_depth=project_in.max_depth,
        max_pages=project_in.max_pages
    )

    
    return APIResponse(
        success=True,
        message="Project created and crawl task scheduled",
        data=ProjectResponse.from_orm(project)
    )

@router.get("/projects/{project_id}", response_model=APIResponse[ProjectResponse])
def get_project(project_id: int, db: Session = Depends(get_db)):
    logger.info("API: Fetching project details for project_id: %d", project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        logger.warning("API: Project %d not found", project_id)
        raise HTTPException(status_code=404, detail="Project not found")
        
    return APIResponse(
        success=True,
        message="Project details retrieved successfully",
        data=ProjectResponse.from_orm(project)
    )

@router.get("/projects/{project_id}/status", response_model=APIResponse[Dict[str, Any]])
def get_project_status(project_id: int, db: Session = Depends(get_db)):
    logger.info("API: Fetching crawl status for project_id: %d", project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        logger.warning("API: Project %d not found", project_id)
        raise HTTPException(status_code=404, detail="Project not found")
        
    pages_count = db.query(Page).filter(Page.project_id == project_id).count()
    failed_pages_count = db.query(Page).filter(Page.project_id == project_id, Page.error_message.isnot(None)).count()
    
    payload = {
        "status": project.status,
        "error_message": project.error_message,
        "pages_crawled": pages_count,
        "failed_pages": failed_pages_count,
        "max_pages": project.max_pages,
        "max_depth": project.max_depth
    }
    
    return APIResponse(
        success=True,
        message="Project status retrieved",
        data=payload
    )

@router.get("/projects/{project_id}/pages", response_model=APIResponse[List[PageResponse]])
def get_project_pages(project_id: int, db: Session = Depends(get_db)):
    logger.info("API: Fetching pages list for project_id: %d", project_id)
    pages = db.query(Page).filter(Page.project_id == project_id).all()
    
    res = []
    for p in pages:
        res.append(PageResponse(
            id=p.id,
            project_id=p.project_id,
            url=p.url,
            title=p.title,
            http_status=p.http_status,
            word_count=p.word_count,
            detected_language=p.detected_language,
            error_message=p.error_message,
            is_selected=p.is_selected,
            translation_status=p.translation_status,
            page_type=classify_page_type(p.url, p.title),
            crawl_issues=analyze_crawl_issues(p),
            crawl_timestamp=p.crawl_timestamp
        ))
        
    return APIResponse(
        success=True,
        message="Project pages retrieved successfully",
        data=res
    )

@router.get("/projects/{project_id}/summary", response_model=APIResponse[Dict[str, Any]])
def get_project_summary(project_id: int, db: Session = Depends(get_db)):
    logger.info("API: Fetching project summary metrics for project_id: %d", project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        logger.warning("API: Project %d not found", project_id)
        raise HTTPException(status_code=404, detail="Project not found")
        
    pages = db.query(Page).filter(Page.project_id == project_id).all()
    total_pages = len(pages)
    total_words = sum(p.word_count for p in pages)
    
    # 250 words per hour standard translation rate
    effort_hours = round(total_words / 250, 1)
    
    successful_crawls = sum(1 for p in pages if p.error_message is None and p.http_status == 200)
    failed_crawls = total_pages - successful_crawls
    
    payload = {
        "total_pages": total_pages,
        "total_words": total_words,
        "estimated_effort_hours": effort_hours,
        "successful_crawls": successful_crawls,
        "failed_crawls": failed_crawls
    }
    
    return APIResponse(
        success=True,
        message="Summary stats retrieved",
        data=payload
    )

@router.put("/pages/{page_id}/selection", response_model=APIResponse[Dict[str, Any]])
def update_page_selection(page_id: int, update: PageSelectionUpdate, db: Session = Depends(get_db)):
    logger.info("API: Toggling selection to %s for page_id: %d", str(update.is_selected), page_id)
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        logger.warning("API: Page %d not found", page_id)
        raise HTTPException(status_code=404, detail="Page not found")
        
    try:
        page.is_selected = update.is_selected
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("API: Database error during page selection update")
        return APIResponse(success=False, message="Database error", errors=[str(e)])
        
    return APIResponse(
        success=True,
        message="Page selection updated",
        data={"page_id": page.id, "is_selected": page.is_selected}
    )

@router.post("/projects/{project_id}/pages/selection", response_model=APIResponse[Dict[str, Any]])
def bulk_update_pages_selection(project_id: int, update: BulkSelectionUpdate, db: Session = Depends(get_db)):
    logger.info("API: Bulk updating selections for %d pages in project: %d", len(update.page_ids), project_id)
    try:
        db.query(Page).filter(
            Page.project_id == project_id,
            Page.id.in_(update.page_ids)
        ).update({"is_selected": update.is_selected}, synchronize_session=False)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("API: Bulk update failed")
        return APIResponse(success=False, message="Bulk selection update failed", errors=[str(e)])
        
    return APIResponse(
        success=True,
        message="Bulk selection updated successfully",
        data={"updated_count": len(update.page_ids), "is_selected": update.is_selected}
    )

@router.get("/pages/{page_id}", response_model=APIResponse[PageResponse])
def get_page(page_id: int, db: Session = Depends(get_db)):
    logger.info("API: Fetching page details for page_id: %d", page_id)
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        logger.warning("API: Page %d not found", page_id)
        raise HTTPException(status_code=404, detail="Page not found")
        
    res = PageResponse(
        id=page.id,
        project_id=page.project_id,
        url=page.url,
        title=page.title,
        http_status=page.http_status,
        word_count=page.word_count,
        detected_language=page.detected_language,
        error_message=page.error_message,
        is_selected=page.is_selected,
        translation_status=page.translation_status,
        page_type=classify_page_type(page.url, page.title),
        crawl_issues=analyze_crawl_issues(page),
        crawl_timestamp=page.crawl_timestamp
    )
    
    return APIResponse(
        success=True,
        message="Page details retrieved",
        data=res
    )

@router.post("/pages/{page_id}/extract", response_model=APIResponse[List[TranslationSegmentResponse]])
def extract_page_segments(page_id: int, db: Session = Depends(get_db)):
    logger.info("API: Extracting segments for page_id: %d", page_id)
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        logger.warning("API: Page %d not found for extraction", page_id)
        raise HTTPException(status_code=404, detail="Page not found")
    
    segments_data = extract_segments(page.html_content)
    res = []
    project = page.project
    target_lang = project.target_language
    
    try:
        for item in segments_data:
            existing = db.query(TranslationSegment).filter(
                TranslationSegment.page_id == page_id,
                TranslationSegment.selector == item["selector"],
                TranslationSegment.source_text == item["source_text"]
            ).first()
            
            if not existing:
                new_seg = TranslationSegment(
                    page_id=page_id,
                    source_text=item["source_text"],
                    source_language=page.detected_language or "en",
                    target_language=target_lang,
                    selector=item["selector"],
                    status="Pending"
                )
                db.add(new_seg)
                res.append(new_seg)
            else:
                res.append(existing)
        db.commit()
        for r in res:
            db.refresh(r)
    except Exception as e:
        db.rollback()
        logger.exception("API: Failed to save extracted segments for page: %d", page_id)
        return APIResponse(success=False, message="Extraction saving failed", errors=[str(e)])
        
    return APIResponse(
        success=True,
        message="Segments extracted successfully",
        data=[TranslationSegmentResponse.from_orm(r) for r in res]
    )

@router.post("/pages/{page_id}/translate", response_model=APIResponse[List[TranslationSegmentResponse]])
def translate_page_segments(page_id: int, db: Session = Depends(get_db)):
    logger.info("API: Translating segments for page_id: %d", page_id)
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        logger.warning("API: Page %d not found for translation", page_id)
        raise HTTPException(status_code=404, detail="Page not found")
    
    segments = db.query(TranslationSegment).filter(
        TranslationSegment.page_id == page_id,
        TranslationSegment.status == "Pending"
    ).all()
    
    if not segments:
        all_segments = db.query(TranslationSegment).filter(TranslationSegment.page_id == page_id).all()
        return APIResponse(
            success=True,
            message="No pending segments to translate",
            data=[TranslationSegmentResponse.from_orm(s) for s in all_segments]
        )
        
    ts = TranslationService()
    to_translate = []
    
    try:
        for seg in segments:
            # Translation Memory check
            tm_match = db.query(TranslationSegment).filter(
                TranslationSegment.source_text == seg.source_text,
                TranslationSegment.target_language == seg.target_language,
                TranslationSegment.translated_text.isnot(None),
                TranslationSegment.status.in_(["Machine Translated", "Edited", "Approved"])
            ).first()
            
            if tm_match:
                logger.info("API: Translation Memory match found: %s", seg.source_text[:30])
                seg.translated_text = tm_match.translated_text
                seg.status = "Machine Translated"
            else:
                to_translate.append(seg)
                
        db.commit()
        
        if to_translate:
            import time
            from concurrent.futures import ThreadPoolExecutor
            
            def worker(seg_id, text, lang):
                try:
                    res = ts.translate_text(text, lang)
                    return seg_id, res, None
                except Exception as ex:
                    return seg_id, None, str(ex)
                    
            BATCH_SIZE = 5
            batches = [to_translate[i:i + BATCH_SIZE] for i in range(0, len(to_translate), BATCH_SIZE)]
            logger.info("API: Translating %d segments in %d batches (batch size: %d)", len(to_translate), len(batches), BATCH_SIZE)
            
            for batch_idx, batch in enumerate(batches):
                logger.info("API: Translating batch %d/%d (size: %d)", batch_idx + 1, len(batches), len(batch))
                with ThreadPoolExecutor(max_workers=len(batch)) as executor:
                    futures = [
                        executor.submit(worker, s.id, s.source_text, s.target_language)
                        for s in batch
                    ]
                    results = [f.result() for f in futures]
                    
                # Apply translations
                for seg_id, translated_text, error in results:
                    seg = db.query(TranslationSegment).filter(TranslationSegment.id == seg_id).first()
                    if seg:
                        if translated_text:
                            seg.translated_text = translated_text
                            seg.status = "Machine Translated"
                        else:
                            logger.error("API: Translation failed for segment %d: %s", seg_id, error)
                db.commit()
                
                # Pause between batches
                if batch_idx < len(batches) - 1:
                    time.sleep(0.5)
            
        # Update page translation_status based on completion
        all_segs = db.query(TranslationSegment).filter(TranslationSegment.page_id == page_id).all()
        pending_count = sum(1 for s in all_segs if s.status == "Pending")
        page.translation_status = "completed" if pending_count == 0 else "in_progress"
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("API: Translation process failed for page: %d", page_id)
        return APIResponse(success=False, message="Translation job failed", errors=[str(e)])
        
    all_segments = db.query(TranslationSegment).filter(TranslationSegment.page_id == page_id).all()
    return APIResponse(
        success=True,
        message="AI Translation completed",
        data=[TranslationSegmentResponse.from_orm(s) for s in all_segments]
    )

@router.get("/pages/{page_id}/segments", response_model=APIResponse[List[TranslationSegmentResponse]])
def get_page_segments(page_id: int, db: Session = Depends(get_db)):
    logger.info("API: Fetching segments for page_id: %d", page_id)
    segments = db.query(TranslationSegment).filter(TranslationSegment.page_id == page_id).all()
    return APIResponse(
        success=True,
        message="Segments retrieved successfully",
        data=[TranslationSegmentResponse.from_orm(s) for s in segments]
    )

@router.put("/segments/{segment_id}", response_model=APIResponse[TranslationSegmentResponse])
def update_segment_translation(segment_id: int, update: TranslationSegmentUpdate, db: Session = Depends(get_db)):
    logger.info("API: Updating manual translation for segment_id: %d", segment_id)
    seg = db.query(TranslationSegment).filter(TranslationSegment.id == segment_id).first()
    if not seg:
        logger.warning("API: Segment %d not found", segment_id)
        raise HTTPException(status_code=404, detail="Segment not found")
        
    try:
        seg.translated_text = update.translated_text
        seg.status = "Edited"
        db.commit()
        db.refresh(seg)
    except Exception as e:
        db.rollback()
        logger.exception("API: Failed to update manual translation")
        return APIResponse(success=False, message="Update failed", errors=[str(e)])
        
    return APIResponse(
        success=True,
        message="Segment translation updated",
        data=TranslationSegmentResponse.from_orm(seg)
    )

@router.post("/segments/{segment_id}/approve", response_model=APIResponse[TranslationSegmentResponse])
def approve_segment_translation(segment_id: int, db: Session = Depends(get_db)):
    logger.info("API: Approving translation for segment_id: %d", segment_id)
    seg = db.query(TranslationSegment).filter(TranslationSegment.id == segment_id).first()
    if not seg:
        logger.warning("API: Segment %d not found", segment_id)
        raise HTTPException(status_code=404, detail="Segment not found")
        
    try:
        seg.status = "Approved"
        db.commit()
        db.refresh(seg)
        
        all_segs = db.query(TranslationSegment).filter(TranslationSegment.page_id == seg.page_id).all()
        if all_segs and all(s.status == "Approved" for s in all_segs):
            page = db.query(Page).filter(Page.id == seg.page_id).first()
            if page:
                page.translation_status = "completed"
                db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("API: Failed to approve segment translation")
        return APIResponse(success=False, message="Approve failed", errors=[str(e)])
        
    return APIResponse(
        success=True,
        message="Segment translation approved",
        data=TranslationSegmentResponse.from_orm(seg)
    )

@router.post("/segments/{segment_id}/regenerate", response_model=APIResponse[TranslationSegmentResponse])
def regenerate_segment_translation(segment_id: int, db: Session = Depends(get_db)):
    logger.info("API: Regenerating AI translation for segment_id: %d", segment_id)
    seg = db.query(TranslationSegment).filter(TranslationSegment.id == segment_id).first()
    if not seg:
        logger.warning("API: Segment %d not found", segment_id)
        raise HTTPException(status_code=404, detail="Segment not found")
        
    ts = TranslationService()
    try:
        translated = ts.translate_text(seg.source_text, seg.target_language)
        seg.translated_text = translated
        seg.status = "Machine Translated"
        db.commit()
        db.refresh(seg)
    except Exception as e:
        db.rollback()
        logger.exception("API: Failed to regenerate segment translation")
        return APIResponse(success=False, message="Regeneration failed", errors=[str(e)])
        
    return APIResponse(
        success=True,
        message="Segment translation regenerated successfully",
        data=TranslationSegmentResponse.from_orm(seg)
    )

@router.post("/pages/{page_id}/reset-segments", response_model=APIResponse)
def reset_page_segments(page_id: int, db: Session = Depends(get_db)):
    """Reset all segments for a page back to 'Pending' status so they can be re-translated."""
    logger.info("API: Resetting segments to Pending for page_id: %d", page_id)
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    
    try:
        count = db.query(TranslationSegment).filter(TranslationSegment.page_id == page_id).update({
            "translated_text": None,
            "status": "Pending"
        })
        page.translation_status = "pending"
        db.commit()
        logger.info("API: Reset %d segments to Pending for page_id: %d", count, page_id)
    except Exception as e:
        db.rollback()
        logger.exception("API: Failed to reset segments for page: %d", page_id)
        return APIResponse(success=False, message="Reset failed", errors=[str(e)])
    
    return APIResponse(
        success=True,
        message=f"Reset {count} segments to Pending",
        data={"reset_count": count}
    )


# ============================================================
# MODULE 4 — PUBLISH & JAVASCRIPT RUNTIME
# ============================================================

def _get_approved_segments(project_id: int, db: Session):
    """Fetch all approved TranslationSegment records for a project across all pages."""
    return db.query(TranslationSegment).join(Page).filter(
        Page.project_id == project_id,
        TranslationSegment.status == "Approved"
    ).all()


def _get_next_version(project_id: int, db: Session) -> int:
    """Compute the next version number for a project's publish history."""
    latest = db.query(PublishVersion).filter(
        PublishVersion.project_id == project_id
    ).order_by(PublishVersion.version.desc()).first()
    return (latest.version + 1) if latest else 1


@router.post("/projects/{project_id}/publish", response_model=APIResponse[PublishVersionResponse])
def publish_project(project_id: int, db: Session = Depends(get_db)):
    """Create the first publish version for a project."""
    logger.info("API: Publishing project_id: %d", project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    approved = _get_approved_segments(project_id, db)
    if not approved:
        return APIResponse(success=False, message="No approved translations to publish.", errors=["No approved segments found."])

    version_num = _get_next_version(project_id, db)
    try:
        pv = PublishVersion(
            project_id=project_id,
            version=version_num,
            status="published",
            total_segments=len(approved)
        )
        db.add(pv)
        db.commit()
        db.refresh(pv)
    except Exception as e:
        db.rollback()
        logger.exception("API: Failed to create publish version for project: %d", project_id)
        return APIResponse(success=False, message="Publish failed", errors=[str(e)])

    logger.info("API: Published project %d as version %d with %d segments", project_id, version_num, len(approved))
    return APIResponse(
        success=True,
        message=f"Published successfully as version {version_num}",
        data=PublishVersionResponse.from_orm(pv)
    )


@router.post("/projects/{project_id}/republish", response_model=APIResponse[PublishVersionResponse])
def republish_project(project_id: int, db: Session = Depends(get_db)):
    """Create a new publish version (increments version number)."""
    logger.info("API: Republishing project_id: %d", project_id)
    return publish_project(project_id, db)


@router.get("/projects/{project_id}/publish-status", response_model=APIResponse[PublishStatusResponse])
def get_publish_status(project_id: int, db: Session = Depends(get_db)):
    """Return current publish status and segment counts."""
    logger.info("API: Getting publish status for project_id: %d", project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    latest = db.query(PublishVersion).filter(
        PublishVersion.project_id == project_id
    ).order_by(PublishVersion.version.desc()).first()

    all_segs = db.query(TranslationSegment).join(Page).filter(Page.project_id == project_id).all()
    approved_count = sum(1 for s in all_segs if s.status == "Approved")

    return APIResponse(
        success=True,
        message="Publish status retrieved",
        data=PublishStatusResponse(
            is_published=latest is not None,
            current_version=latest.version if latest else None,
            published_at=latest.published_at if latest else None,
            total_approved=approved_count,
            total_segments=len(all_segs),
            project_id=project_id
        )
    )


@router.get("/projects/{project_id}/versions", response_model=APIResponse[List[PublishVersionResponse]])
def get_publish_versions(project_id: int, db: Session = Depends(get_db)):
    """Return full publish history for a project."""
    logger.info("API: Getting publish history for project_id: %d", project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    versions = db.query(PublishVersion).filter(
        PublishVersion.project_id == project_id
    ).order_by(PublishVersion.version.desc()).all()

    return APIResponse(
        success=True,
        message=f"Found {len(versions)} publish versions",
        data=[PublishVersionResponse.from_orm(v) for v in versions]
    )


@router.get("/projects/{project_id}/runtime")
def get_runtime_payload(project_id: int, db: Session = Depends(get_db)):
    """Return the approved translation payload consumed by loc.js.
    Publicly accessible (CORS wildcard applied in main.py for this route).
    """
    logger.info("API: Runtime payload requested for project_id: %d", project_id)
    
    # Try file storage first (stateless mode)
    import os
    import json
    file_path = os.path.join(os.path.dirname(__file__), "..", "runtime", f"publish_{project_id}.json")
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to read publish file for project %d: %s", project_id, str(e))

    # Fallback to database if available
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    latest = db.query(PublishVersion).filter(
        PublishVersion.project_id == project_id
    ).order_by(PublishVersion.version.desc()).first()

    if not latest:
        return {"project_id": project_id, "version": 0, "target_language": project.target_language, "translations": []}

    approved = _get_approved_segments(project_id, db)
    translations = [
        {"selector": s.selector, "original": s.source_text, "translated": s.translated_text}
        for s in approved
        if s.translated_text  # never include blank translations
    ]

    return {
        "project_id": project_id,
        "version": latest.version,
        "target_language": project.target_language,
        "translations": translations
    }


@router.get("/projects/{project_id}/script")
def get_script_snippet(project_id: int, request: Request, db: Session = Depends(get_db)):
    """Return the embeddable script HTML snippet for this project."""
    # We do NOT require the project to exist in the database for stateless mode.
    base_url = str(request.base_url).rstrip('/')
    snippet = f'<script src="{base_url}/runtime/loc.js" data-project="{project_id}" async></script>'
    return APIResponse(
        success=True,
        message="Script snippet generated",
        data={"snippet": snippet, "project_id": project_id}
    )

# ─── Stateless Schemas and Endpoints ──────────────────────────────────────────

class CrawlRequest(BaseModel):
    url: str
    max_depth: int = 2
    max_pages: int = 10

class CrawledPage(BaseModel):
    url: str
    title: str = ""
    html_content: str = ""
    word_count: int = 0
    detected_language: str = ""
    http_status: int = 200
    error_message: str = ""

@router.post("/projects/crawl-stateless", response_model=APIResponse[List[CrawledPage]])
async def crawl_stateless(req: CrawlRequest):
    """
    Crawls the requested URL up to max_pages and max_depth,
    returning the crawled pages and their HTML directly in the response.
    """
    logger.info("Stateless Crawl: Starting crawl for url: %s", req.url)
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
    from bs4 import BeautifulSoup
    
    start_url = req.url
    max_depth = req.max_depth
    max_pages = req.max_pages
    
    visited = set()
    queued_or_visited = {normalize_url(start_url)}
    queue = [(start_url, 0)]  # (url, depth)
    pages_crawled = 0
    crawled_results = []
    
    try:
        async with async_playwright() as p:
            logger.info("Stateless Crawl: Launching headless Chromium browser")
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            
            while queue and pages_crawled < max_pages:
                current_url, current_depth = queue.pop(0)
                normalized_url_str = normalize_url(current_url)
                
                if normalized_url_str in visited:
                    continue
                    
                visited.add(normalized_url_str)
                pages_crawled += 1
                logger.info("Stateless Crawl: Page %d/%d (depth %d): %s", pages_crawled, max_pages, current_depth, current_url)
                
                page_data = CrawledPage(url=normalized_url_str)
                
                try:
                    page = await context.new_page()
                    response = await page.goto(current_url, timeout=15000, wait_until="domcontentloaded")
                    
                    if response:
                        page_data.http_status = response.status
                        if response.ok:
                            html_content = await page.content()
                            page_data.html_content = html_content
                            page_data.title = await page.title() or ""
                            
                            soup = BeautifulSoup(html_content, 'html.parser')
                            text = soup.get_text(separator=' ')
                            words = text.split()
                            page_data.word_count = len(words)
                            
                            html_tag = soup.find('html')
                            if html_tag and html_tag.get('lang'):
                                page_data.detected_language = html_tag.get('lang')
                            
                            # Extract links for next depth
                            if current_depth < max_depth:
                                links = await page.evaluate('''() => {
                                    return Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
                                }''')
                                
                                for link in links:
                                    norm_link = normalize_url(link)
                                    if norm_link not in queued_or_visited:
                                        if is_internal_link(start_url, link) and is_valid_page_link(link):
                                            queued_or_visited.add(norm_link)
                                            queue.append((link, current_depth + 1))
                        else:
                            page_data.error_message = f"HTTP Error {response.status}"
                    else:
                        page_data.error_message = "No response received"
                    
                    await page.close()
                except PlaywrightTimeoutError:
                    page_data.error_message = "Timeout occurred"
                except Exception as e:
                    page_data.error_message = f"Error: {str(e)}"
                
                crawled_results.append(page_data)
                
            await browser.close()
            
        return APIResponse(
            success=True,
            message=f"Stateless crawl completed. Discovered {len(crawled_results)} pages.",
            data=crawled_results
        )
    except Exception as e:
        logger.exception("Stateless Crawl failed")
        return APIResponse(success=False, message="Stateless crawl failed", errors=[str(e)])

class ExtractRequest(BaseModel):
    html_content: str

class ExtractedSegment(BaseModel):
    source_text: str
    selector: str

@router.post("/pages/extract-stateless", response_model=APIResponse[List[ExtractedSegment]])
def extract_segments_stateless(req: ExtractRequest):
    """
    Parses HTML content and extracts translatable segments statelessly.
    """
    logger.info("Stateless Extract: Extracting segments from HTML")
    try:
        raw_segments = extract_segments(req.html_content)
        extracted = []
        for text, selector in raw_segments:
            extracted.append(ExtractedSegment(source_text=text, selector=selector))
            
        return APIResponse(
            success=True,
            message="Segments extracted successfully",
            data=extracted
        )
    except Exception as e:
        logger.exception("Stateless Extract failed")
        return APIResponse(success=False, message="Extraction failed", errors=[str(e)])

class TranslationSegmentItem(BaseModel):
    source_text: str
    selector: str

class TranslateRequest(BaseModel):
    segments: List[TranslationSegmentItem]
    target_language: str

class TranslatedSegmentItem(BaseModel):
    source_text: str
    selector: str
    translated_text: str

@router.post("/pages/translate-stateless", response_model=APIResponse[List[TranslatedSegmentItem]])
def translate_segments_stateless(req: TranslateRequest):
    """
    Translates provided segments using Gemini API statelessly.
    """
    logger.info("Stateless Translate: Translating %d segments into %s", len(req.segments), req.target_language)
    try:
        ts = TranslationService()
        import concurrent.futures
        
        results = []
        def worker(item: TranslationSegmentItem):
            try:
                translated = ts.translate_text(item.source_text, req.target_language)
                return TranslatedSegmentItem(
                    source_text=item.source_text,
                    selector=item.selector,
                    translated_text=translated
                )
            except Exception as e:
                logger.error("Failed to translate: %s, error: %s", item.source_text[:30], str(e))
                return TranslatedSegmentItem(
                    source_text=item.source_text,
                    selector=item.selector,
                    translated_text=f"[Error: {str(e)}]"
                )
                
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_item = {executor.submit(worker, item): item for item in req.segments}
            for future in concurrent.futures.as_completed(future_to_item):
                results.append(future.result())
                
        return APIResponse(
            success=True,
            message="Segments translated successfully",
            data=results
        )
    except Exception as e:
        logger.exception("Stateless Translate failed")
        return APIResponse(success=False, message="Translation failed", errors=[str(e)])

class PublishRequest(BaseModel):
    project_id: int
    target_language: str
    translations: List[Dict[str, Any]]

@router.post("/projects/publish-stateless", response_model=APIResponse[Dict[str, Any]])
def publish_stateless(req: PublishRequest):
    """
    Saves published translations to a static JSON file on disk,
    allowing loc.js to fetch them dynamically without querying a database.
    """
    import os
    import json
    
    logger.info("Stateless Publish: Publishing project %d into %s", req.project_id, req.target_language)
    try:
        payload = {
            "project_id": req.project_id,
            "version": 1,
            "target_language": req.target_language,
            "translations": req.translations
        }
        
        # Write to static file inside the runtime directory
        runtime_dir = os.path.join(os.path.dirname(__file__), "..", "runtime")
        os.makedirs(runtime_dir, exist_ok=True)
        
        file_path = os.path.join(runtime_dir, f"publish_{req.project_id}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            
        return APIResponse(
            success=True,
            message="Project published successfully",
            data={
                "project_id": req.project_id,
                "version": 1,
                "target_language": req.target_language
            }
        )
    except Exception as e:
        logger.exception("Stateless Publish failed")
        return APIResponse(success=False, message="Publish failed", errors=[str(e)])
