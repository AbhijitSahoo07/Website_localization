import re
from bs4 import BeautifulSoup
from app.models.page import Page

def classify_page_type(url: str, title: str) -> str:
    """Classify page based on URL patterns and content markers."""
    url_lower = url.lower()
    title_lower = (title or "").lower()
    
    # 1. Contact
    if any(k in url_lower for k in ["/contact", "contact-us", "/support", "/help"]):
        return "Contact"
        
    # 2. Legal
    if any(k in url_lower for k in ["/legal", "/privacy", "/terms", "/tos", "/policy"]):
        return "Legal"
        
    # 3. Blog
    if any(k in url_lower for k in ["/blog", "/post", "/article", "/news"]):
        return "Blog"
        
    # 4. Documentation
    if any(k in url_lower for k in ["/docs", "/documentation", "/guide", "/api-reference"]):
        return "Documentation"
        
    # 5. Product Page
    if any(k in url_lower for k in ["/product", "/shop", "/item", "/p/", "/store"]):
        return "Product Page"
        
    # 6. Marketing Page (Landing pages, homepages)
    if url_lower.count("/") <= 3 or "home" in title_lower or "landing" in title_lower:
        return "Marketing Page"
        
    return "Other"

def analyze_crawl_issues(page: Page) -> list[str]:
    """Detect crawl issues like missing title, 404, timeout, or missing meta description."""
    issues = []
    
    # Check HTTP Status
    if page.http_status == 404:
        issues.append("404")
    elif page.http_status and 300 <= page.http_status < 400:
        issues.append("Redirect")
        
    # Check Timeout or Errors
    err_msg = (page.error_message or "").lower()
    if "timeout" in err_msg:
        issues.append("Timeout")
    elif err_msg:
        issues.append(f"Crawl Error: {page.error_message}")
        
    # Check Title
    if not page.title or page.title.strip() == "":
        issues.append("Missing title")
        
    # Check Word Count
    if page.word_count == 0:
        issues.append("Empty page")
        
    # Check Meta Description using BeautifulSoup
    if page.html_content:
        try:
            soup = BeautifulSoup(page.html_content, "html.parser")
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if not meta_desc or not meta_desc.get("content", "").strip():
                issues.append("Missing meta description")
        except Exception:
            # Fallback if parsing fails
            if 'name="description"' not in page.html_content:
                issues.append("Missing meta description")
    else:
        issues.append("Missing meta description")
        
    return issues
