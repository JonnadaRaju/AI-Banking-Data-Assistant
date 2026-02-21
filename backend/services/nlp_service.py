"""
services/nlp_service.py
Converts natural language queries to SQL using HuggingFace SQLCoder API.
This is the AI brain of the application.
"""

import time
import logging
import requests

from backend.config import HF_API_TOKEN, HF_API_URL, MAX_RETRIES, RETRY_DELAY
from backend.services.validator import clean_sql

logger = logging.getLogger(__name__)
────────────────────────────────────────────
DB_SCHEMA = """
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at DATETIME
);

CREATE TABLE accounts (
    account_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    account_number TEXT,
    account_type TEXT,
    balance REAL,
    created_at DATETIME,
    FOREIGN KEY(customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE transactions (
    transaction_id INTEGER PRIMARY KEY,
    account_id INTEGER,
    amount REAL,
    transaction_type TEXT,
    description TEXT,
    transaction_date DATETIME,
    FOREIGN KEY(account_id) REFERENCES accounts(account_id)
);
"""


def build_prompt(user_query: str) -> str:
    return f"""### Instructions:
Your task is to convert a question into a SQL query, given a SQLite database schema.
Adhere to these rules strictly:
- Only generate SELECT queries. Never use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any DDL/DML.
- Use SQLite syntax only. Do not use MySQL or PostgreSQL specific functions.
- For today's date use: date('now')
- For this week use: date('now', '-7 days')
- Use table aliases for JOINs: c for customers, a for accounts, t for transactions
- Always qualify column names with table aliases in JOINs
- For account_number comparisons, treat it as TEXT

### Database Schema:
{DB_SCHEMA}

### Input:
Generate a SQL query that answers this question: `{user_query}`

### Response:
SELECT"""


def query_to_sql(user_query: str) -> str:
    """
    Send user query to HuggingFace SQLCoder and return the generated SQL.

    Retries automatically if the model is loading (503 response).

    Args:
        user_query: Plain English question from the user.

    Returns:
        A SQL SELECT string.

    Raises:
        Exception: If the API fails after all retries.
    """
    prompt = build_prompt(user_query)
    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 300,
            "temperature": 0.1,
            "do_sample": False,
            "return_full_text": False
        }
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"Calling HuggingFace SQLCoder API (attempt {attempt}/{MAX_RETRIES})")
            response = requests.post(HF_API_URL, headers=headers, json=payload, timeout=60)

           
            if response.status_code == 503:
                logger.warning(f"Model loading (503). Waiting {RETRY_DELAY}s before retry...")
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                    continue
                else:
                    raise Exception(
                        "AI model is currently loading. Please wait 30 seconds and try again."
                    )

            if response.status_code == 401:
                raise Exception(
                    "Invalid HuggingFace API token. Check your .env file."
                )

            if response.status_code == 429:
                raise Exception(
                    "HuggingFace API rate limit reached. Please wait a moment and try again."
                )

            if response.status_code != 200:
                raise Exception(
                    f"HuggingFace API error {response.status_code}: {response.text[:200]}"
                )

            result = response.json()

            raw_sql = _extract_sql_from_response(result)

            if not raw_sql:
                raise Exception("AI model returned an empty response.")

            sql = "SELECT " + clean_sql(raw_sql)

            logger.info(f"Generated SQL: {sql}")
            return sql

        except requests.exceptions.Timeout:
            logger.error("HuggingFace API request timed out.")
            if attempt < MAX_RETRIES:
                time.sleep(5)
                continue
            raise Exception("Request to AI model timed out. Please try again.")

        except requests.exceptions.ConnectionError:
            raise Exception(
                "Cannot connect to HuggingFace API. Check your internet connection."
            )

    raise Exception("Failed to generate SQL after maximum retries.")


def _extract_sql_from_response(response: any) -> str:
    try:
        if isinstance(response, list) and len(response) > 0:
            item = response[0]
            if isinstance(item, dict):
                return item.get("generated_text", "").strip()
            return str(item).strip()

        if isinstance(response, dict):
            return response.get("generated_text", "").strip()

        return str(response).strip()

    except Exception as e:
        logger.error(f"Failed to parse HuggingFace response: {e}")
        return ""
