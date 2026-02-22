import logging
from typing import Any, Optional

import httpx

from backend.config import (
    DB_STATEMENT_TIMEOUT_MS,
    REST_DB_TIMEOUT_SECONDS,
    SUPABASE_KEY,
    SUPABASE_URL,
)
from backend.database.connection import get_connection, use_supabase_rest
from backend.models.schemas import ChartData

logger = logging.getLogger(__name__)


def execute_query(sql: str) -> tuple[list[str], list[list[Any]], Optional[ChartData]]:
    if use_supabase_rest():
        return _execute_query_rest(sql)
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


def _execute_query_rest(sql: str) -> tuple[list[str], list[list[Any]], Optional[ChartData]]:
    if not (SUPABASE_URL and SUPABASE_KEY):
        raise Exception("SUPABASE_URL and SUPABASE_KEY are required for REST mode.")

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            f"{SUPABASE_URL}/rest/v1/rpc/run_query",
            headers=headers,
            json={"sql": sql},
            timeout=REST_DB_TIMEOUT_SECONDS,
        )
    except Exception as e:
        logger.error(f"Supabase REST request failed: {e}")
        raise Exception("Database error: cannot connect to Supabase REST API.")

    if response.status_code != 200:
        logger.error(f"Supabase REST error {response.status_code}: {response.text[:300]}")
        if response.status_code in (404, 400) and "run_query" in response.text:
            raise Exception(
                "Database error: Supabase RPC function `run_query(sql text)` is missing. "
                "Create it in Supabase SQL Editor, or use SUPABASE_DB_URL direct mode."
            )
        raise Exception(
            "Database error: Supabase REST call failed. Ensure RPC function `run_query(sql text)` exists."
        )

    result = response.json()
    if not result:
        return [], [], None

    columns = list(result[0].keys())
    rows = [[row.get(col) for col in columns] for row in result]
    rows = _sanitize_rows(rows)
    chart_data = _build_chart_data(columns, rows)
    logger.info(f"Query returned {len(rows)} rows with columns: {columns}")
    return columns, rows, chart_data


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

    label_candidates = ["transaction_type", "account_type", "name", "description"]
    value_candidates = [
        "amount",
        "total",
        "count",
        "sum",
        "balance",
        "total_credit",
        "total_debit",
        "transaction_count",
    ]

    for i, col in enumerate(columns):
        col_lower = col.lower()
        if any(candidate in col_lower for candidate in label_candidates):
            label_col_idx = i
        if any(candidate in col_lower for candidate in value_candidates):
            value_col_idx = i

    if label_col_idx is not None and value_col_idx is not None and len(rows) <= 20:
        try:
            labels = [str(row[label_col_idx]) for row in rows]
            values = [
                float(row[value_col_idx]) if row[value_col_idx] is not None else 0.0
                for row in rows
            ]
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
                    values = [
                        float(row[amount_idx]) if row[amount_idx] is not None else 0.0
                        for row in rows
                    ]
                    return ChartData(type="bar", labels=labels, values=values)
                except (TypeError, ValueError):
                    pass

    return None
