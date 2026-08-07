from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Website Localization Automation Tool"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "sqlite:///./sql_app.db"
    GEMINI_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
