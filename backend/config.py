import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "").strip()
DATABASE_PATH: str = os.getenv("DATABASE_PATH", "banking.db")
MAX_RETRIES: int = 3
RETRY_DELAY: int = 20


def validate_config() -> None:
    if not OPENAI_API_KEY:
        raise ValueError(
            "OPENAI_API_KEY is not set. Create a .env file with OPENAI_API_KEY=your_key_here"
        )
    if not OPENAI_MODEL:
        raise ValueError("OPENAI_MODEL is not set. Example: gpt-4o-mini")
    if not DATABASE_PATH:
        raise ValueError("DATABASE_PATH is not set.")
