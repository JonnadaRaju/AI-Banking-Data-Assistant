import logging
from contextlib import contextmanager
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import httpx

from backend.config import (
    DB_CONNECT_TIMEOUT_SECONDS,
    REST_DB_TIMEOUT_SECONDS,
    SUPABASE_DB_URL,
    SUPABASE_KEY,
    SUPABASE_URL,
)

logger = logging.getLogger(__name__)


def has_rest_config() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def can_use_direct_connection() -> bool:
    if not SUPABASE_DB_URL:
        return False
    try:
        import psycopg  # noqa: F401
        return True
    except ModuleNotFoundError:
        return False


def validate_direct_db_url() -> None:
    if not SUPABASE_DB_URL:
        return

    parsed = urlsplit(SUPABASE_DB_URL)
    if parsed.hostname and "@" in parsed.hostname:
        raise RuntimeError(
            "SUPABASE_DB_URL appears invalid. If your password contains special characters "
            "like '@', URL-encode it (for example '@' -> '%40')."
        )


def normalize_direct_db_url() -> str:
    if not SUPABASE_DB_URL:
        return ""

    parsed = urlsplit(SUPABASE_DB_URL)
    if not parsed.scheme.startswith("postgres"):
        return SUPABASE_DB_URL

    if parsed.username is None or parsed.password is None:
        return SUPABASE_DB_URL

    username = quote(unquote(parsed.username), safe="")
    password = quote(unquote(parsed.password), safe="")

    host = parsed.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"

    host_port = host
    if parsed.port is not None:
        host_port = f"{host}:{parsed.port}"

    netloc = f"{username}:{password}@{host_port}"
    return urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))


def init_database() -> None:
    if can_use_direct_connection():
        logger.info("Using Supabase Postgres via direct DB URL.")
    elif has_rest_config():
        logger.info("Using Supabase REST API mode.")
    elif SUPABASE_DB_URL:
        logger.warning("SUPABASE_DB_URL is set, but psycopg is not installed.")
    else:
        logger.warning("Supabase configuration missing.")


def use_supabase_rest() -> bool:
    return has_rest_config() and not can_use_direct_connection()


@contextmanager
def get_connection():
    if not SUPABASE_DB_URL:
        raise RuntimeError("SUPABASE_DB_URL is required for direct Postgres connections.")
    validate_direct_db_url()

    try:
        import psycopg
    except ModuleNotFoundError as exc:
        if has_rest_config():
            raise RuntimeError(
                "psycopg is not installed for direct mode, but REST mode is available. "
                "Use SUPABASE_URL + SUPABASE_KEY."
            ) from exc
        raise RuntimeError(
            "psycopg is not installed. Install with: pip install \"psycopg[binary]>=3.2.0\" "
            "or configure SUPABASE_URL + SUPABASE_KEY for REST mode."
        ) from exc

    db_url = normalize_direct_db_url()
    conn = psycopg.connect(db_url, connect_timeout=DB_CONNECT_TIMEOUT_SECONDS)
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
        if use_supabase_rest():
            response = httpx.get(
                f"{SUPABASE_URL}/rest/v1/customers",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                },
                params={"limit": 1},
                timeout=REST_DB_TIMEOUT_SECONDS,
            )
            return response.status_code == 200

        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return True
    except Exception as e:
        logger.error(f"Supabase health check failed: {e}")
        return False
