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


OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "").strip()
SUPABASE_DB_URL: str = os.getenv("SUPABASE_DB_URL", "").strip()
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "").strip()
MAX_RETRIES: int = _env_int("MAX_RETRIES", 3)
RETRY_DELAY: int = _env_int("RETRY_DELAY", 20)
OPENAI_REQUEST_TIMEOUT_SECONDS: int = _env_int("OPENAI_REQUEST_TIMEOUT_SECONDS", 45)
DB_CONNECT_TIMEOUT_SECONDS: int = _env_int("DB_CONNECT_TIMEOUT_SECONDS", 10)
DB_STATEMENT_TIMEOUT_MS: int = _env_int("DB_STATEMENT_TIMEOUT_MS", 30000, minimum=1000)
REST_DB_TIMEOUT_SECONDS: int = _env_int("REST_DB_TIMEOUT_SECONDS", 30)

def validate_config() -> None:
    if not OPENAI_API_KEY:
        raise ValueError(
            "OPENAI_API_KEY is not set. "
            "Create a .env file with OPENAI_API_KEY=your_key_here"
        )
    if not OPENAI_MODEL:
        raise ValueError("OPENAI_MODEL is not set. Example: gpt-4o-mini")
    has_db_url = bool(SUPABASE_DB_URL)
    has_rest_config = bool(SUPABASE_URL and SUPABASE_KEY)
    if not has_db_url and not has_rest_config:
        raise ValueError(
            "Configure database access in .env with "
            "SUPABASE_DB_URL, or SUPABASE_URL + SUPABASE_KEY."
        )
