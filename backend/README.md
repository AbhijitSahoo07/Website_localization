# Backend - Website Localization Automation Tool

This is the FastAPI backend for the Website Localization Automation Tool.

## Getting Started

1. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in the values.

4. Run the development server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Architecture

- `app/api`: API routers and endpoints
- `app/core`: Core configuration (e.g., settings, security)
- `app/crawler`: Modules for crawling and extracting website content
- `app/database`: Database session and base models setup
- `app/models`: SQLAlchemy ORM models
- `app/schemas`: Pydantic schemas for request/response validation
- `app/services`: Business logic and external service integrations (e.g., LLM translation)
- `app/utils`: Helper functions and utilities
