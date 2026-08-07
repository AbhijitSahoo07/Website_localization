from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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
from app.crawler.engine import crawl_project
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
def get_script_snippet(project_id: int, db: Session = Depends(get_db)):
    """Return the embeddable script HTML snippet for this project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    snippet = f'<script src="http://localhost:8000/runtime/loc.js" data-project="{project_id}" async></script>'
    return APIResponse(
        success=True,
        message="Script snippet generated",
        data={"snippet": snippet, "project_id": project_id}
    )
