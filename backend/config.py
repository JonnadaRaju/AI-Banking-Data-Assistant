import os
from dotenv import load_dotenv

load_dotenv()

HF_API_TOKEN: str = os.getenv("HF_API_TOKEN", "")
DATABASE_PATH: str = os.getenv("DATABASE_PATH", "banking.db")
HF_API_URL: str = "https://api-inference.huggingface.co/models/defog/sqlcoder-7b-2"
MAX_RETRIES: int = 3
RETRY_DELAY: int = 20


def validate_config() -> None:
    if not HF_API_TOKEN:
        raise ValueError(
            "HF_API_TOKEN is not set. Create a .env file with HF_API_TOKEN=your_token_here"
        )
    if not DATABASE_PATH:
        raise ValueError("DATABASE_PATH is not set.")