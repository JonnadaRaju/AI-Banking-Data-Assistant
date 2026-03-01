import logging
from typing import Any, Optional

from backend.config import DB_STATEMENT_TIMEOUT_MS
from backend.database.connection import get_connection
from backend.models.schemas import ChartData

logger = logging.getLogger(__name__)


def execute_query(sql: str) -> tuple[list[str], list[list[Any]], Optional[ChartData]]:
    return _execute_query_direct(sql)


def _execute_query_direct(sql: str) -> tuple[list[str], list[list[Any]], Optional[ChartData]]:
    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute(f"SET LOCAL statement_timeout = {DB_STATEMENT_TIMEOUT_MS}")
                cursor.execute(sql)

                columns = [desc.name for desc in cursor.description] if cursor.description else []
                raw_rows = cursor.fetchall() if cursor.description else []

            rows = [_row_to_list(row, columns) for row in raw_rows]
            rows = _sanitize_rows(rows)
            chart_data = _build_chart_data(columns, rows)

            logger.info(f"Query returned {len(rows)} rows with columns: {columns}")
            return columns, rows, chart_data

        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise Exception(f"Database error: {str(e)}")


def _row_to_list(row: Any, columns: list[str]) -> list[Any]:
    if isinstance(row, (list, tuple)):
        return list(row)
    if hasattr(row, "keys"):
        return [row.get(col) for col in columns]
    return [row]


def _sanitize_rows(rows: list[list[Any]]) -> list[list[Any]]:
    sanitized = []
    for row in rows:
        clean_row = []
        for val in row:
            if val is None:
                clean_row.append(None)
            elif isinstance(val, bytes):
                clean_row.append(val.decode("utf-8", errors="replace"))
            elif isinstance(val, (int, float, str, bool)):
                clean_row.append(val)
            else:
                clean_row.append(str(val))
        sanitized.append(clean_row)
    return sanitized


def _build_chart_data(columns: list[str], rows: list[list[Any]]) -> Optional[ChartData]:
    if not rows or not columns:
        return None

    if len(rows) == 1 and len(columns) == 1:
        return None

    label_col_idx = None
    value_col_idx = None

    label_keywords = ["transaction_type", "account_type", "name", "description", "type"]
    # BUG FIX: use substring match (col_lower contains keyword) instead of exact match
    # This fixes cases where column is named "total_amount", "credit_amount", etc.
    value_keywords = ["amount", "total", "count", "sum", "balance",
                      "credit", "debit", "revenue", "payment"]

    col_lower_list = [c.lower() for c in columns]

    for i, col_lower in enumerate(col_lower_list):
        if label_col_idx is None and any(kw in col_lower for kw in label_keywords):
            label_col_idx = i
        if value_col_idx is None and any(kw in col_lower for kw in value_keywords):
            value_col_idx = i

    # If no value column found by keyword, try to find any numeric column
    if value_col_idx is None:
        for i, col_lower in enumerate(col_lower_list):
            if i == label_col_idx:
                continue
            numeric_vals = [row[i] for row in rows if row[i] is not None]
            if numeric_vals and all(isinstance(v, (int, float)) or
               (isinstance(v, str) and _is_numeric(v)) for v in numeric_vals):
                value_col_idx = i
                break

    if label_col_idx is not None and value_col_idx is not None and len(rows) <= 20:
        try:
            labels = [str(row[label_col_idx]) for row in rows]
            values = [float(row[value_col_idx]) if row[value_col_idx] is not None else 0.0
                      for row in rows]
            return ChartData(type="bar", labels=labels, values=values)
        except (TypeError, ValueError):
            pass

    # BUG FIX: use substring match instead of exact "amount" in columns
    amount_idx = next((i for i, c in enumerate(col_lower_list) if "amount" in c), None)
    if amount_idx is not None and len(rows) <= 15:
        for label_col in ["description", "transaction_type", "name", "type"]:
            # BUG FIX: use substring match for label column too
            lbl_idx = next((i for i, c in enumerate(col_lower_list) if label_col in c), None)
            if lbl_idx is not None:
                try:
                    labels = [str(row[lbl_idx]) for row in rows]
                    values = [float(row[amount_idx]) if row[amount_idx] is not None else 0.0
                              for row in rows]
                    return ChartData(type="bar", labels=labels, values=values)
                except (TypeError, ValueError):
                    pass

    return None


def _is_numeric(value: str) -> bool:
    try:
        float(value)
        return True
    except (ValueError, TypeError):
        return False