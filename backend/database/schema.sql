CREATE TABLE customers (
    customer_id   SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    phone         TEXT,
    address       TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounts (
    account_id     SERIAL PRIMARY KEY,
    customer_id    INTEGER NOT NULL,
    account_number TEXT UNIQUE NOT NULL,
    account_type   TEXT CHECK(account_type IN ('savings','current','fixed')) NOT NULL,
    balance        NUMERIC DEFAULT 0.0,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

CREATE TABLE transactions (
    transaction_id   SERIAL PRIMARY KEY,
    account_id       INTEGER NOT NULL,
    amount           NUMERIC NOT NULL,
    transaction_type TEXT CHECK(transaction_type IN ('credit','debit')) NOT NULL,
    description      TEXT,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);