from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Default LLM provider — "deepseek" or "gemini"
    LLM_PROVIDER: str = "deepseek"

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    COMPANY_DATA_DIR: str = "../company_data"
    GENERATED_DIR: str = "../generated"
    CHROMA_DIR: str = "./chroma_db"
    SQLITE_PATH: str = "./chat_history.db"

    TOP_K: int = 12
    CHUNK_SIZE: int = 1200
    CHUNK_OVERLAP: int = 200
    KEYWORD_TOP_K: int = 6  # additional matches from a literal keyword scan

    EMBED_MODEL: str = "all-MiniLM-L6-v2"

    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def company_data_path(self) -> Path:
        return Path(self.COMPANY_DATA_DIR).resolve()

    @property
    def generated_path(self) -> Path:
        return Path(self.GENERATED_DIR).resolve()

    @property
    def warnings_path(self) -> Path:
        return self.generated_path / "warnings"

    @property
    def chroma_path(self) -> Path:
        return Path(self.CHROMA_DIR).resolve()

    @property
    def sqlite_path(self) -> Path:
        return Path(self.SQLITE_PATH).resolve()


settings = Settings()

# Ensure required directories exist at import time
for p in (settings.company_data_path, settings.generated_path, settings.warnings_path, settings.chroma_path):
    p.mkdir(parents=True, exist_ok=True)
