const path = require('path');
const Database = require('better-sqlite3');

// Try both common names
const dbFiles = [
    path.resolve(__dirname, 'server/finance_app.db'),
    path.resolve(__dirname, 'server/finance.db')
];

dbFiles.forEach(dbFile => {
    console.log('--- Checking DB:', dbFile, '---');
    try {
        const db = new Database(dbFile, { readonly: true });
        const accounts = db.prepare('SELECT id, name, code, type, parent_id FROM accounts').all();
        console.log(JSON.stringify(accounts, null, 2));
    } catch (e) {
        console.log('Could not read table from', dbFile, ':', e.message);
    }
});
