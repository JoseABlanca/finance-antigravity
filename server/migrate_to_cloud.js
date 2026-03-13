const DatabaseLocal = require('better-sqlite3');
const Libsql = require('libsql');

const dbUrl = 'libsql://finance-financeantigravity.aws-eu-west-1.turso.io';
const dbToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiI0ZWZjYmEwMi0wYWQzLTQ3NTctOTI4MC0xNjY3YTU2NmMwNWUiLCJpYXQiOjE3NzIzOTgxMjAsInJpZCI6ImRjMTFlODFkLWY2OWEtNGY1MC05MzQ4LTBhZmY4Y2NiOTMxOSJ9.4UEOlgJxPjNihZAXYyh1J5RWucF9KhldwyUJZvS1_tsEj7lkVgLFEYwjnrnOMixNWWxKM597KzD2UFQvfiSRAg';

const dbLocal = new DatabaseLocal('finance_app.db');
const dbCloud = new Libsql(dbUrl, {
    authToken: dbToken
});

async function migrate() {
    console.log('--- Starting Migration ---');
    try {
        const accounts = dbLocal.prepare('SELECT * FROM accounts').all();
        const transactions = dbLocal.prepare('SELECT * FROM transactions').all();
        const journalEntries = dbLocal.prepare('SELECT * FROM journal_entries').all();
        const investmentTrades = dbLocal.prepare('SELECT * FROM investment_trades').all();

        console.log(`Found locally: ${accounts.length} accounts, ${transactions.length} transactions, ${journalEntries.length} entries, ${investmentTrades.length} trades.`);

        console.log('Disabling FKs and cleaning cloud database...');
        dbCloud.exec('PRAGMA foreign_keys = OFF');

        dbCloud.exec('DELETE FROM investment_trades');
        dbCloud.exec('DELETE FROM journal_entries');
        dbCloud.exec('DELETE FROM transactions');
        dbCloud.exec('DELETE FROM accounts');

        console.log('Migrating accounts...');
        for (const acc of accounts) {
            dbCloud.prepare('INSERT OR IGNORE INTO accounts (id, parent_id, code, name, type, subtype, full_path) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(acc.id, acc.parent_id || null, acc.code || '', acc.name, acc.type, acc.subtype || null, acc.full_path || null);
        }

        console.log('Migrating transactions...');
        for (const tx of transactions) {
            dbCloud.prepare('INSERT OR IGNORE INTO transactions (id, date, description, reference) VALUES (?, ?, ?, ?)')
                .run(tx.id, tx.date, tx.description, tx.reference || null);
        }

        console.log('Migrating journal entries...');
        for (const je of journalEntries) {
            dbCloud.prepare('INSERT OR IGNORE INTO journal_entries (id, transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
                .run(je.id, je.transaction_id, je.account_id, je.debit, je.credit);
        }

        console.log('Migrating trades...');
        for (const tr of investmentTrades) {
            // New schema: id, transaction_id, symbol, ACTION, quantity, price, fee, currency, exchange_rate, broker
            dbCloud.prepare('INSERT OR IGNORE INTO investment_trades (id, transaction_id, symbol, ACTION, quantity, price, fee, currency, exchange_rate, broker) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .run(tr.id, tr.transaction_id, tr.symbol, tr.action, tr.quantity, tr.price, tr.fees || 0, tr.currency || 'EUR', tr.exchange_rate || 1.0, tr.broker || null);
        }

        dbCloud.exec('PRAGMA foreign_keys = ON');
        console.log('--- Migration Finished Successfully ---');
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
