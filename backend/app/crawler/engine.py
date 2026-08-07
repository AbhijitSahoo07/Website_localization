import asyncio
from urllib.parse import urlparse, urldefrag
from urllib.robotparser import RobotFileParser
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from sqlalchemy.orm import Session
from bs4 import BeautifulSoup

from app.models.project import Project, ProjectStatus
from app.models.page import Page
from app.database.session import SessionLocal
from app.core.logging import get_logger

logger = get_logger(__name__)

def normalize_url(url: str) -> str:
    """Remove fragments and trailing slashes for consistent comparison."""
    url, _ = urldefrag(url)
    if url.endswith('/'):
        url = url[:-1]
    return url

def is_internal_link(base_url: str, link: str) -> bool:
    """Check if the link belongs to the same domain as the base_url, ignoring www."""
    base_domain = urlparse(base_url).netloc.lower().replace("www.", "")
    link_domain = urlparse(link).netloc.lower().replace("www.", "")
    return link_domain == "" or link_domain == base_domain

def is_valid_page_link(link: str) -> bool:
    """Skip common non-HTML resources and protocols."""
    link_lower = link.lower()
    if link_lower.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return False
    
    invalid_extensions = (
        ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".mp4", ".mp3", 
        ".zip", ".tar", ".gz", ".rar", ".exe", ".css", ".js"
    )
    if any(link_lower.endswith(ext) for ext in invalid_extensions):
        return False
        
    return True

async def crawl_project(project_id: int, start_url: str, max_depth: int = 3, max_pages: int = 50):
    """
    Main crawling engine using Playwright.
    Executes in the background.
    """
    logger.info("Initializing crawl for project_id: %d, start_url: %s", project_id, start_url)
    db: Session = SessionLocal()
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        logger.error("Project with id %d not found, aborting crawl", project_id)
        db.close()
        return

    try:
        project.status = ProjectStatus.CRAWLING
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("Failed to mark project %d as CRAWLING", project_id)
        db.close()
        return

    # Initialize robots.txt parser
    rp = RobotFileParser()
    parsed_start = urlparse(start_url)
    robots_url = f"{parsed_start.scheme}://{parsed_start.netloc}/robots.txt"
    rp.set_url(robots_url)
    
    logger.info("Fetching robots.txt rules from: %s", robots_url)
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, rp.read)
        logger.info("Successfully loaded robots.txt guidelines")
    except Exception as e:
        logger.warning("Could not load robots.txt (%s), proceeding without constraints", str(e))
        rp = None

    visited = set()
    queued_or_visited = {normalize_url(start_url)}
    queue = [(start_url, 0)]  # (url, depth)
    pages_crawled = 0
    initial_page_failed = False
    initial_error_msg = ""

    try:
        async with async_playwright() as p:
            logger.info("Launching headless Chromium browser")
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            
            while queue and pages_crawled < max_pages:
                current_url, current_depth = queue.pop(0)
                normalized_url = normalize_url(current_url)
                
                # Check robots.txt permissions
                if rp and not rp.can_fetch("*", current_url):
                    logger.info("Skipping URL disallowed by robots.txt: %s", current_url)
                    continue

                if normalized_url in visited:
                    continue
                    
                visited.add(normalized_url)
                pages_crawled += 1
                logger.info("Crawling page %d/%d (depth %d): %s", pages_crawled, max_pages, current_depth, current_url)
                
                # Setup page record
                page_record = Page(
                    project_id=project.id,
                    url=normalized_url,
                    http_status=0,
                    word_count=0
                )
                try:
                    db.add(page_record)
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.exception("Failed to insert page record for URL: %s", normalized_url)
                    continue

                try:
                    page = await context.new_page()
                    response = await page.goto(current_url, timeout=30000, wait_until="domcontentloaded")
                    
                    if response:
                        page_record.http_status = response.status
                        logger.info("HTTP Status received: %d for URL: %s", response.status, current_url)
                        
                        if response.ok:
                            html_content = await page.content()
                            page_record.html_content = html_content
                            page_record.title = await page.title()
                            
                            # Calculate word count using BeautifulSoup
                            soup = BeautifulSoup(html_content, 'html.parser')
                            text = soup.get_text(separator=' ')
                            words = text.split()
                            page_record.word_count = len(words)
                            
                            # Simple language detection
                            html_tag = soup.find('html')
                            if html_tag and html_tag.get('lang'):
                                page_record.detected_language = html_tag.get('lang')
                            
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
                            page_record.error_message = f"HTTP Error {response.status}"
                            if current_url == start_url:
                                initial_page_failed = True
                                initial_error_msg = page_record.error_message
                    else:
                        page_record.error_message = "No response received"
                        if current_url == start_url:
                            initial_page_failed = True
                            initial_error_msg = page_record.error_message
                        
                    await page.close()
                    
                except PlaywrightTimeoutError:
                    logger.warning("Timeout occurred while fetching URL: %s", current_url)
                    page_record.error_message = "Timeout occurred"
                    if current_url == start_url:
                        initial_page_failed = True
                        initial_error_msg = page_record.error_message
                except Exception as e:
                    logger.exception("Failed to crawl page: %s", current_url)
                    page_record.error_message = f"Error: {str(e)}"
                    if current_url == start_url:
                        initial_page_failed = True
                        initial_error_msg = page_record.error_message
                
                try:
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.exception("Failed to commit crawled details for URL: %s", current_url)
                
            await browser.close()
            
            try:
                if initial_page_failed:
                    project.status = ProjectStatus.FAILED
                    project.error_message = f"Failed to crawl homepage: {initial_error_msg}"
                    logger.error("Crawl failed: Homepage could not be retrieved")
                else:
                    project.status = ProjectStatus.COMPLETED
                    logger.info("Crawl completed successfully for project: %d", project_id)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.exception("Failed to commit final status update for project: %d", project_id)

    except Exception as e:
        logger.exception("Unexpected exception inside playwright context loop")
        try:
            project.status = ProjectStatus.FAILED
            project.error_message = str(e)
            db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


