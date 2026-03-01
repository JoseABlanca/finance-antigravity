const Database = require('better-sqlite3');
const path = require('path');

const dbApp = new Database(path.resolve(__dirname, 'finance_app.db'));
const dbOld = new Database(path.resolve(__dirname, 'finance.db'));

try {
    const transactionsApp = dbApp.prepare('SELECT id, date, description FROM transactions').all();
    const transactionsOld = dbOld.prepare('SELECT id, date, description FROM transactions').all();

    const appIds = new Set(transactionsApp.map(t => t.id));
    const missingInApp = transactionsOld.filter(t => !appIds.has(t.id));

    console.log('Transactions in finance.db but NOT in finance_app.db:');
    if (missingInApp.length === 0) {
        console.log('None found.');
    } else {
        missingInApp.forEach(t => {
            console.log(`ID: ${t.id}, Date: ${t.date}, Description: ${t.description}`);
            // Get entries for this transaction
            const entries = dbOld.prepare(`
                SELECT e.*, a.name as account_name 
                FROM journal_entries e 
                JOIN accounts a ON e.account_id = a.id 
                WHERE e.transaction_id = ?
            `).all(t.id);
            entries.forEach(e => {
                console.log(`  - ${e.account_name}: Debit ${e.debit}, Credit ${e.credit}`);
            });
        });
    }
} catch (err) {
    console.error('Error:', err.message);
} finally {
    dbApp.close();
    dbOld.close();
}
