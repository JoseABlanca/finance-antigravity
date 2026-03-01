const db = require('./server/db');

console.log('Checking tables...');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables found:', tables.map(t => t.name));

const expectedTables = ['accounts', 'transactions', 'journal_entries', 'investment_trades', 'market_data'];
const missing = expectedTables.filter(t => !tables.find(found => found.name === t));

if (missing.length === 0) {
    console.log('All expected tables exist.');
} else {
    console.error('Missing tables:', missing);
}
