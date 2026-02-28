import re
import time
import logging
import openai
from openai import OpenAI

from backend.config import (
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    OPENAI_BASE_URL,
    MAX_RETRIES,
    OPENAI_REQUEST_TIMEOUT_SECONDS,
    RETRY_DELAY,
)
from backend.services.validator import clean_sql

logger = logging.getLogger(__name__)

DB_SCHEMA = """
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP
);

CREATE TABLE accounts (
    account_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    account_number TEXT,
    account_type TEXT,
    balance NUMERIC,
    created_at TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE transactions (
    transaction_id INTEGER PRIMARY KEY,
    account_id INTEGER,
    amount NUMERIC,
    transaction_type TEXT,
    description TEXT,
    transaction_date TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(account_id)
);
"""


def build_prompt(user_query: str) -> str:
    return f"""You are an expert SQL generator for a PostgreSQL banking database.

Database schema:
{DB_SCHEMA}

Rules:
- Generate ONLY a single SELECT query
- Use PostgreSQL syntax only
- For today use: CURRENT_DATE
- For this week use: CURRENT_DATE - INTERVAL '7 days'
- Use aliases: c for customers, a for accounts, t for transactions
- Return ONLY the SQL query, no explanation, no markdown, no backticks

Question: {user_query}"""


def query_to_sql(user_query: str) -> str:
    prompt = build_prompt(user_query)

    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENAI_BASE_URL,
        timeout=OPENAI_REQUEST_TIMEOUT_SECONDS,
        max_retries=0,
    )

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"Calling OpenRouter API (attempt {attempt}/{MAX_RETRIES})")
            result = client.chat.completions.create(
                model=OPENROUTER_MODEL,
                messages=[
                    {"role": "system", "content": "Generate one safe PostgreSQL SELECT query only."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=300,
                temperature=0.1,
            )
            content = ""
            if result and result.choices:
                content = result.choices[0].message.content or ""
            raw_sql = _extract_sql(content)

            if not raw_sql:
                raise Exception("AI model returned an empty response.")

            sql = clean_sql(raw_sql)
            logger.info(f"SQL generated: {sql}")
            return sql

        except (openai.APITimeoutError, TimeoutError):
            if attempt < MAX_RETRIES:
                time.sleep(5)
                continue
            raise Exception("Request to AI model timed out. Please try again.")

        except openai.AuthenticationError:
            raise Exception("Invalid OpenRouter API key. Check your .env file.")

        except openai.RateLimitError:
            raise Exception("OpenRouter API rate limit reached. Please wait a moment.")

        except openai.APIConnectionError:
            raise Exception("Cannot connect to OpenRouter API. Check your internet connection.")

        except openai.APIError as e:
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
                continue
            raise Exception(f"OpenRouter API error: {str(e)[:200]}")

    raise Exception("Failed to generate SQL after maximum retries.")


def _extract_sql(response: str) -> str:
    try:
        if not response:
            return ""
        text = str(response).strip()
        match = re.search(r"```(?:sql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
        if match:
            text = match.group(1).strip()
        select_idx = text.upper().rfind("SELECT")
        if select_idx != -1:
            text = text[select_idx:]
        return text.strip()
    except Exception as e:
        logger.error(f"Failed to parse response: {e}")
        return ""