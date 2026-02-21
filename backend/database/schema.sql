CREATE TABLE IF NOT EXISTS customers (
    customer_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    phone         TEXT,
    address       TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
    account_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id    INTEGER NOT NULL,
    account_number TEXT UNIQUE NOT NULL,
    account_type   TEXT CHECK(account_type IN ('savings','current','fixed')) NOT NULL,
    balance        REAL DEFAULT 0.0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id       INTEGER NOT NULL,
    amount           REAL NOT NULL,
    transaction_type TEXT CHECK(transaction_type IN ('credit','debit')) NOT NULL,
    description      TEXT,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);