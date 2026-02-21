import sqlite3
import logging
from contextlib import contextmanager
from pathlib import Path

from backend.config import DATABASE_PATH

logger = logging.getLogger(__name__)


def init_database() -> None:
    schema_path = Path(__file__).parent / "schema.sql"
    seed_path   = Path(__file__).parent / "seed.sql"

    with get_connection() as conn:
        # Step 1: Create tables
        if schema_path.exists():
            with open(schema_path, "r") as f:
                conn.executescript(f.read())
            logger.info("Database schema loaded successfully.")
        else:
            raise FileNotFoundError(f"schema.sql not found at {schema_path}")

        # Step 2: Seed only if table is empty
        cursor = conn.execute("SELECT COUNT(*) FROM customers")
        count  = cursor.fetchone()[0]

        if count == 0 and seed_path.exists():
            with open(seed_path, "r") as f:
                conn.executescript(f.read())
            logger.info("Seed data loaded successfully.")
        elif count > 0:
            logger.info(f"Database already has {count} customers. Skipping seed.")
        else:
            logger.warning("seed.sql not found. Database will be empty.")


@contextmanager
def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

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
            conn.execute("SELECT 1")
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False