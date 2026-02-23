import os
from dotenv import load_dotenv

load_dotenv()


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(int(raw), minimum)
    except ValueError:
        return default


OPENAI_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENROUTER_MODEL", "mistralai/mistral-7b-instruct")
OPENAI_BASE_URL: str = "https://openrouter.ai/api/v1"
POSTGRES_URL: str = os.getenv("POSTGRES_URL", "").strip()

MAX_RETRIES: int = _env_int("MAX_RETRIES", 3)
RETRY_DELAY: int = _env_int("RETRY_DELAY", 20)
OPENAI_REQUEST_TIMEOUT_SECONDS: int = _env_int("OPENAI_REQUEST_TIMEOUT_SECONDS", 45)
DB_CONNECT_TIMEOUT_SECONDS: int = _env_int("DB_CONNECT_TIMEOUT_SECONDS", 10)
DB_STATEMENT_TIMEOUT_MS: int = _env_int("DB_STATEMENT_TIMEOUT_MS", 30000, minimum=1000)
REST_DB_TIMEOUT_SECONDS: int = _env_int("REST_DB_TIMEOUT_SECONDS", 30)


def validate_config() -> None:
    if not OPENAI_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set in .env")
    if not OPENAI_MODEL:
        raise ValueError("OPENROUTER_MODEL is not set in .env")
    if not POSTGRES_URL:
        raise ValueError("POSTGRES_URL is not set in .env")