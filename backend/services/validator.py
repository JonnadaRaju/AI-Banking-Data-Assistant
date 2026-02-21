import re
import logging

logger = logging.getLogger(__name__)

BLOCKED_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "EXEC", "EXECUTE", "TRUNCATE", "REPLACE", "MERGE",
    "CALL", "GRANT", "REVOKE", "ATTACH", "DETACH",
    "PRAGMA", "--", "/*", "*/"
]


def validate_sql(sql: str) -> tuple[bool, str]:
    if not sql or not sql.strip():
        return False, "Empty SQL query received."

    cleaned = sql.strip()

    if not cleaned.upper().startswith("SELECT"):
        logger.warning(f"Blocked non-SELECT query: {cleaned[:100]}")
        return False, "Query blocked: only SELECT statements are allowed."

    sql_upper = cleaned.upper()
    for keyword in BLOCKED_KEYWORDS:
        if keyword in ("--", "/*", "*/"):
            if keyword in cleaned:
                logger.warning(f"Blocked SQL comment injection: {cleaned[:100]}")
                return False, "Query blocked: SQL comments are not allowed."
        else:
            pattern = rf'\b{re.escape(keyword)}\b'
            if re.search(pattern, sql_upper):
                logger.warning(f"Blocked dangerous keyword '{keyword}': {cleaned[:100]}")
                return False, "Query blocked: only SELECT statements are allowed."

    stripped = cleaned.rstrip(";").rstrip()
    if ";" in stripped:
        logger.warning(f"Blocked multi-statement query: {cleaned[:100]}")
        return False, "Query blocked: multiple SQL statements are not allowed."

    return True, ""


def clean_sql(raw_sql: str) -> str:
    if not raw_sql:
        return ""

    text = raw_sql.strip()

    if text.upper().startswith("SELECT"):
        return _extract_first_statement(text)

    return "SELECT " + _extract_first_statement(text)


def _extract_first_statement(sql: str) -> str:
    if ";" in sql:
        sql = sql[:sql.index(";") + 1]
    return sql.strip()
