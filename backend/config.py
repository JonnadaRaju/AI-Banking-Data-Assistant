import os
from pathlib import Path
from dotenv import load_dotenv

# Always find .env relative to this file, works regardless of working directory
_BASE_DIR = Path(__file__).resolve().parent.parent  # project root
load_dotenv(_BASE_DIR / ".env")


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(int(raw), minimum)
    except ValueError:
        return default


OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
OPENAI_BASE_URL: str = "https://openrouter.ai/api/v1"
POSTGRES_URL: str = os.getenv("POSTGRES_URL", "").strip()
SARVAM_API_KEY: str = os.getenv("SARVAM_API_KEY", "").strip()

MAX_RETRIES: int = _env_int("MAX_RETRIES", 3)
RETRY_DELAY: int = _env_int("RETRY_DELAY", 20)
OPENAI_REQUEST_TIMEOUT_SECONDS: int = _env_int("OPENAI_REQUEST_TIMEOUT_SECONDS", 45)
DB_CONNECT_TIMEOUT_SECONDS: int = _env_int("DB_CONNECT_TIMEOUT_SECONDS", 10)
DB_STATEMENT_TIMEOUT_MS: int = _env_int("DB_STATEMENT_TIMEOUT_MS", 30000, minimum=1000)
REST_DB_TIMEOUT_SECONDS: int = _env_int("REST_DB_TIMEOUT_SECONDS", 30)


def validate_config() -> None:
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set in .env")
    if not OPENROUTER_MODEL:
        raise ValueError("OPENROUTER_MODEL is not set in .env")
    if not POSTGRES_URL:
        raise ValueError("POSTGRES_URL is not set in .env")