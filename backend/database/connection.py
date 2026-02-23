import logging
from contextlib import contextmanager
from backend.config import POSTGRES_URL, DB_CONNECT_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

def init_database() -> None:
    logger.info("Using PostgreSQL via direct connection.")

def use_supabase_rest() -> bool:
    return False  

@contextmanager
def get_connection():
    if not POSTGRES_URL:
        raise RuntimeError("POSTGRES_URL is not set in .env")
    try:
        import psycopg
    except ModuleNotFoundError:
        raise RuntimeError("psycopg not installed. Run: pip install psycopg[binary]")

    conn = psycopg.connect(POSTGRES_URL, connect_timeout=DB_CONNECT_TIMEOUT_SECONDS)
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error, rolling back: {e}")
        raise
    finally:
        conn.close()

def check_connection() -> bool:
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return True
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        return False