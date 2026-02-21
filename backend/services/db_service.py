import logging
from typing import Any, Optional

from backend.database.connection import get_connection
from backend.models.schemas import ChartData

logger = logging.getLogger(__name__)


def execute_query(sql: str) -> tuple[list[str], list[list[Any]], Optional[ChartData]]:
    with get_connection() as conn:
        try:
            cursor = conn.execute(sql)
            columns = [description[0] for description in cursor.description]
            raw_rows = cursor.fetchall()
            rows = [list(row) for row in raw_rows]
            rows = _sanitize_rows(rows)
            chart_data = _build_chart_data(columns, rows)
            logger.info(f"Query returned {len(rows)} rows | columns: {columns} | chart: {chart_data is not None}")
            return columns, rows, chart_data
        except Exception as e:
            logger.error(f"Query execution failed: {e}\nSQL: {sql}")
            raise Exception(f"Database error: {str(e)}")


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


def _is_numeric(val) -> bool:
    if val is None:
        return False
    try:
        float(val)
        return True
    except (TypeError, ValueError):
        return False


def _build_chart_data(columns: list[str], rows: list[list[Any]]) -> Optional[ChartData]:
    if not rows or not columns:
        return None

    if len(rows) == 1 and len(columns) == 1:
        return None

    col_lower = [c.lower() for c in columns]

    numeric_idx = None
    label_idx = None

    numeric_keywords = ["amount", "balance", "total", "sum", "count", "credit", "debit", "value"]
    label_keywords   = ["transaction_type", "type", "account_type", "account_number",
                        "name", "description", "email", "address"]

    for i, col in enumerate(col_lower):
        if label_idx is None:
            for kw in label_keywords:
                if kw in col:
                    label_idx = i
                    break

    for i, col in enumerate(col_lower):
        if numeric_idx is None:
            for kw in numeric_keywords:
                if kw in col:
                    numeric_idx = i
                    break

    if numeric_idx is None:
        for i, col in enumerate(col_lower):
            if all(_is_numeric(row[i]) for row in rows if row[i] is not None):
                numeric_idx = i
                break

    if label_idx is None:
        for i, col in enumerate(col_lower):
            if i != numeric_idx:
                if all(isinstance(row[i], str) for row in rows if row[i] is not None):
                    label_idx = i
                    break

    if numeric_idx is not None and len(rows) >= 1:
        if label_idx is not None:
            labels = [str(row[label_idx]) if row[label_idx] is not None else f"Row {i+1}" for i, row in enumerate(rows)]
        else:
            labels = [f"Row {i+1}" for i in range(len(rows))]

        try:
            values = [float(row[numeric_idx]) if _is_numeric(row[numeric_idx]) else 0.0 for row in rows]
            return ChartData(type="bar", labels=labels, values=values)
        except (TypeError, ValueError):
            pass

    return None