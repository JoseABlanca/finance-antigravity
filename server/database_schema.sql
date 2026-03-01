-- Database Schema for Antigravity (SQLite)
-- This file is the source of truth for the database structure.

-- Enable Foreign Keys support
PRAGMA foreign_keys = ON;

-- -----------------------------------------------------
-- Table: accounts
-- Description: Hierarchical chart of accounts
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    code TEXT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')) NOT NULL,
    subtype TEXT, -- PGC Grouping: 'NON_CURRENT', 'CURRENT', etc.
    full_path TEXT, -- Helper for hierarchy sort/display
    FOREIGN KEY(parent_id) REFERENCES accounts(id) ON DELETE RESTRICT
);

-- -----------------------------------------------------
-- Table: transactions
-- Description: Header for distinct financial events
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, -- ISO 8601 YYYY-MM-DD
    description TEXT,
    reference TEXT
);

-- -----------------------------------------------------
-- Table: journal_entries
-- Description: Double-entry lines linking accounts to transactions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    debit REAL DEFAULT 0,
    credit REAL DEFAULT 0,
    FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE RESTRICT
);

-- -----------------------------------------------------
-- Table: investment_trades
-- Description: Specific details for investment transactions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS investment_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    symbol TEXT NOT NULL,
    action TEXT CHECK(action IN ('BUY', 'SELL', 'DIVIDEND', 'INTEREST')) NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    fee REAL DEFAULT 0,
    currency TEXT DEFAULT 'EUR',
    exchange_rate REAL DEFAULT 1.0,
    broker TEXT,
    FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table: market_data
-- Description: Cache for external market data (prices)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS market_data (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL,
    PRIMARY KEY (symbol, date)
);
