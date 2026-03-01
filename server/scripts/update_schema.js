const db = require('../db');

function addColumnIfNotExists(table, column, definition) {
    try {
        const stmt = db.prepare(`SELECT count(*) as count FROM pragma_table_info('${table}') WHERE name='${column}'`);
        const result = stmt.get();
        if (result.count === 0) {
            console.log(`Adding column ${column} to ${table}...`);
            db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
            console.log(`Column ${column} added successfully.`);
        } else {
            console.log(`Column ${column} already exists in ${table}.`);
        }
    } catch (err) {
        console.error(`Error adding column ${column} to ${table}:`, err.message);
    }
}

console.log('Starting schema update...');

addColumnIfNotExists('investment_trades', 'currency', "TEXT DEFAULT 'EUR'");
addColumnIfNotExists('investment_trades', 'exchange_rate', 'REAL DEFAULT 1.0');

console.log('Schema update complete.');
