import logging
import time
import re

import openai
from openai import OpenAI

from backend.config import (
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_MODEL,
    MAX_RETRIES,
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
    return f"""You are an expert data engineer who writes safe, read-only SQLite queries.

Database schema:
{DB_SCHEMA}

Rules:
- Return exactly one valid SQLite SELECT statement and nothing else.
- Do NOT include comments, markdown, code fences, explanations, or additional text.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, PRAGMA, or any DDL/DML.
- Use table aliases: customers = c, accounts = a, transactions = t.
- Qualify columns with aliases in JOINs.
- account_number is TEXT.
- Today's date: date('now'); this week: date('now', '-7 days').
- Limit query length to what is necessary.

User question: {user_query}

Return only the SQL query."""


def query_to_sql(user_query: str) -> str:
    prompt = build_prompt(user_query)

    client_kwargs = {"api_key": OPENAI_API_KEY}
    if OPENAI_BASE_URL:
        client_kwargs["base_url"] = OPENAI_BASE_URL
    client = OpenAI(**client_kwargs)

    system_message = (
        "You are a senior data engineer. Generate the most accurate, safe SQLite SELECT query for the given "
        "banking schema. Do not return anything except the SQL."
    )

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"Calling OpenAI chat completions (attempt {attempt}/{MAX_RETRIES})")
            completion = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=300,
                temperature=0.1,
                timeout=60,
            )

            content = ""
            if completion and completion.choices:
                content = completion.choices[0].message.content or ""

            raw_sql = _extract_sql_from_response(content)

            if not raw_sql:
                raise Exception("AI model returned an empty response.")

            sql = clean_sql(raw_sql)
            logger.info("SQL query generated successfully.")
            return sql

        except openai.RateLimitError:
            raise Exception("OpenAI API rate limit reached. Please wait a moment and try again.")

        except openai.AuthenticationError:
            raise Exception("Invalid OpenAI API key. Check your .env file.")

        except (openai.APITimeoutError, TimeoutError):
            logger.error("OpenAI API request timed out.")
            if attempt < MAX_RETRIES:
                time.sleep(5)
                continue
            raise Exception("Request to AI model timed out. Please try again.")

        except openai.APIConnectionError:
            raise Exception("Cannot connect to OpenAI API. Check your internet connection.")

        except openai.APIError as e:
            raise Exception(f"OpenAI API error: {str(e)[:200]}")

        except Exception as e:
            logger.error(f"OpenAI call failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
                continue
            raise

    raise Exception("Failed to generate SQL after maximum retries.")


def _extract_sql_from_response(response) -> str:
    try:
        if not response:
            return ""

        text = str(response).strip()

        # Strip Markdown code fences if present
        fence_match = re.search(r"```(?:sql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
        if fence_match:
            text = fence_match.group(1).strip()

        # If the model echoed instructions, take the last SELECT onwards
        select_idx = text.upper().rfind("SELECT")
        if select_idx != -1:
            text = text[select_idx:]

        return text.strip()

    except Exception as e:
        logger.error(f"Failed to parse OpenAI response: {e}")
        return ""
