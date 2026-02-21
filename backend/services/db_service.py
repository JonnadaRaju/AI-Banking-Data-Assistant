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

            logger.info(f"Query returned {len(rows)} rows with columns: {columns}")
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


def _build_chart_data(columns: list[str], rows: list[list[Any]]) -> Optional[ChartData]:
    if not rows or not columns:
        return None

    if len(rows) == 1 and len(columns) == 1:
        return None

    label_col_idx = None
    value_col_idx = None

    label_candidates = ["transaction_type", "account_type", "name", "description"]
    value_candidates = ["amount", "total", "count", "sum", "balance", "total_credit",
                        "total_debit", "transaction_count"]

    for i, col in enumerate(columns):
        col_lower = col.lower()
        if any(candidate in col_lower for candidate in label_candidates):
            label_col_idx = i
        if any(candidate in col_lower for candidate in value_candidates):
            value_col_idx = i

    if label_col_idx is not None and value_col_idx is not None and len(rows) <= 20:
        try:
            labels = [str(row[label_col_idx]) for row in rows]
            values = [float(row[value_col_idx]) if row[value_col_idx] is not None else 0.0
                      for row in rows]
            return ChartData(type="bar", labels=labels, values=values)
        except (TypeError, ValueError):
            pass

    if "amount" in columns and len(rows) <= 15:
        amount_idx = columns.index("amount")
        for label_col in ["description", "transaction_type", "name"]:
            if label_col in columns:
                label_idx = columns.index(label_col)
                try:
                    labels = [str(row[label_idx]) for row in rows]
                    values = [float(row[amount_idx]) if row[amount_idx] is not None else 0.0
                              for row in rows]
                    return ChartData(type="bar", labels=labels, values=values)
                except (TypeError, ValueError):
                    pass

    return None
