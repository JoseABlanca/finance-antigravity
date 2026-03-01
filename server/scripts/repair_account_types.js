const db = require('../db');

function repair() {
    console.log('Starting account type repair...');

    // 1. Get all root accounts
    const roots = db.prepare('SELECT id, type, name, code FROM accounts WHERE parent_id IS NULL').all();

    const updateStmt = db.prepare(`
        WITH RECURSIVE family(child_id) AS (
            SELECT id FROM accounts WHERE parent_id = ?
            UNION ALL
            SELECT a.id FROM accounts a, family f WHERE a.parent_id = f.child_id
        )
        UPDATE accounts SET type = ? WHERE id IN (SELECT child_id FROM family)
    `);

    try {
        db.transaction(() => {
            for (const root of roots) {
                console.log(`Propagating type ${root.type} from root "${root.name}" (${root.code})...`);
                const info = updateStmt.run(root.id, root.type);
                if (info.changes > 0) {
                    console.log(`  -> Updated ${info.changes} sub-accounts.`);
                }
            }
        })();
        console.log('Repair complete successfully.');
    } catch (err) {
        console.error('Error during repair:', err.message);
    }
}

repair();
process.exit(0);
