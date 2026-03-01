const Database = require('better-sqlite3');
const path = require('path');

const dbApp = new Database(path.resolve(__dirname, 'finance_app.db'));
const dbOld = new Database(path.resolve(__dirname, 'finance.db'));

try {
    console.log('--- Database Comparison ---');

    // Check missing transactions
    const txApp = dbApp.prepare('SELECT id, date, description FROM transactions').all();
    const txOld = dbOld.prepare('SELECT id, date, description FROM transactions').all();

    console.log(`Current Transactions: ${txApp.length}`);
    console.log(`Backup Transactions: ${txOld.length}`);

    const appIds = new Set(txApp.map(t => t.id));
    const missingTx = txOld.filter(t => !appIds.has(t.id));

    console.log('\nMissing Transactions in Current DB:');
    missingTx.forEach(t => console.log(`- ID ${t.id}: [${t.date}] ${t.description}`));

    // Check entries for each current transaction
    console.log('\n--- Checking current transactions for missing entries ---');
    txApp.forEach(t => {
        const entries = dbApp.prepare('SELECT COUNT(*) as count FROM journal_entries WHERE transaction_id = ?').get(t.id);
        console.log(`- Transaction ID ${t.id}: ${entries.count} entries`);
        if (entries.count === 0) {
            // Check if backup has entries for this ID
            const oldEntries = dbOld.prepare(`
                SELECT e.*, a.name as account_name 
                FROM journal_entries e 
                JOIN accounts a ON e.account_id = a.id 
                WHERE e.transaction_id = ?
            `).all(t.id);
            if (oldEntries.length > 0) {
                console.log(`  ! Found ${oldEntries.length} entries in backup for this transaction:`);
                oldEntries.forEach(e => console.log(`    * ${e.account_name}: Dr ${e.debit}, Cr ${e.credit}`));
            }
        }
    });

    // Find "just deleted" if it's not a missing transaction but missing entries in a transaction that still exists
    // Or if it's a transaction that was ONLY in Current DB but now is gone? I can't know that from backup.

} catch (err) {
    console.error('Error:', err.message);
} finally {
    dbApp.close();
    dbOld.close();
}
