import time
from google import genai
from google.genai import types
from bs4 import BeautifulSoup
from app.core.config import settings
from app.core.logging import get_logger


logger = get_logger(__name__)

class TranslationService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
            self.model_name = "gemini-3.5-flash"

            logger.info("TranslationService: Gemini client initialized successfully")
        else:
            self.client = None
            logger.warning("TranslationService: No Gemini API Key configured in env settings")

    def translate_text(self, text: str, target_language: str, retries: int = 3, delay: float = 2.0) -> str:
        """Call Gemini to translate a single text segment with exponential backoff retry support."""
        if not self.api_key or not self.client:
            logger.error("TranslationService: Gemini API key is missing")
            raise ValueError("Gemini API key is not configured.")

        prompt = (
            f"You are a professional website localization assistant. "
            f"Translate only the provided text into {target_language}. "
            f"Preserve meaning, tone, punctuation, placeholders, variables, URLs, and brand names. "
            f"Return only the translated text.\n\n{text}"
        )
        
        for attempt in range(retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                    )
                )
                if response and response.text:
                    translated = response.text.strip()
                    logger.info("TranslationService: Successfully translated segment.")
                    return translated
                else:
                    raise Exception("Response from Gemini API is empty")
            except Exception as e:
                logger.warning("TranslationService: Attempt %d failed. Error: %s", attempt + 1, str(e))
                if attempt == retries - 1:
                    logger.error("TranslationService: All retry attempts failed for text: %s", text)
                    raise e
                time.sleep(delay * (2 ** attempt))

def _make_css_selector(el) -> str:
    """Build a stable CSS selector for a BeautifulSoup element.
    Priority: id > class > nth-of-type positional fallback.
    """
    tag = el.name
    if el.get("id"):
        return f"{tag}#{el['id']}"
    classes = el.get("class", [])
    if classes:
        cls = ".".join(c for c in classes[:2] if c)  # use up to 2 classes
        if cls:
            return f"{tag}.{cls}"
    # Positional nth-of-type fallback - count siblings of same tag
    siblings = el.find_parent().find_all(tag, recursive=False) if el.find_parent() else []
    idx = list(siblings).index(el) + 1 if el in siblings else 1
    return f"{tag}:nth-of-type({idx})"


def extract_segments(html_content: str) -> list[dict]:
    """Parse HTML and extract visible translatable tags, excluding scripts, styles, pre, code."""
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, "html.parser")
    segments = []
    seen_texts = set()  # Deduplicate identical source text across tags

    # 1. Meta Title
    title_tag = soup.find("title")
    if title_tag and title_tag.get_text().strip():
        segments.append({
            "source_text": title_tag.get_text().strip(),
            "selector": "title"
        })
        seen_texts.add(title_tag.get_text().strip())

    # 2. Meta Description
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc and meta_desc.get("content", "").strip():
        text = meta_desc.get("content").strip()
        segments.append({
            "source_text": text,
            "selector": "meta[name=description]"
        })
        seen_texts.add(text)

    # Remove script, style, svg, code, pre tags to prevent crawling them
    for tag in ["script", "style", "svg", "code", "pre", "noscript"]:
        for el in soup.find_all(tag):
            el.decompose()

    # Heuristic matching for visible content containers
    tags_to_extract = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "a", "span", "li", "label"]

    for el in soup.find_all(True):
        if el.name in tags_to_extract:
            # Skip parent container if its text content is identical to one of its child elements
            has_identical_child = False
            for child in el.find_all(tags_to_extract):
                if child != el and child.get_text(strip=True) == el.get_text(strip=True):
                    has_identical_child = True
                    break
            if has_identical_child:
                continue

            text = el.get_text(strip=True)
            if text and len(text) > 1:
                selector = _make_css_selector(el)
                # Avoid exact duplicate of selector
                if not any(s["selector"] == selector for s in segments):
                    segments.append({
                        "source_text": text,
                        "selector": selector
                    })
        elif el.name == "img":
            alt = el.get("alt", "").strip()
            if alt:
                img_id = el.get("id", "")
                selector = f"img#{img_id}" if img_id else f"img[alt='{alt[:30]}']"
                if not any(s["selector"] == selector for s in segments):
                    segments.append({
                        "source_text": alt,
                        "selector": selector
                    })

    return segments


