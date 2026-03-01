const db = require('../db');

console.log('Starting PGC migration...');

try {
    // 1. Add column if not exists
    try {
        db.prepare('ALTER TABLE accounts ADD COLUMN subtype TEXT').run();
        console.log('Added subtype column to accounts table.');
    } catch (err) {
        if (err.message.includes('duplicate column name')) {
            console.log('Subtype column already exists.');
        } else {
            // ignore if exists
        }
    }

    // 2. Update existing accounts based on PGC codes (Subtypes)
    const updateStmt = db.prepare('UPDATE accounts SET subtype = ? WHERE id = ?');
    const accounts = db.prepare('SELECT id, code, type FROM accounts').all();

    let updatedCount = 0;

    const migrationTransaction = db.transaction(() => {
        accounts.forEach(acc => {
            let subtype = null;
            // Parse code safely
            const codeVal = parseInt(acc.code.replace(/\./g, ''));
            // Use simple logic or existing logic. 
            // Existing logic relied on `parseInt(acc.code)` which stops at dot.
            // e.g. "572.1" -> 572. Correct.

            const code = parseInt(acc.code);

            if (acc.type === 'ASSET') {
                if (code >= 200 && code < 300) subtype = 'NON_CURRENT'; // Inmovilizado
                else if (code >= 300 && code < 600) subtype = 'CURRENT'; // Existencias, Deudores, Tesorería
            } else if (acc.type === 'LIABILITY') {
                if (code >= 100 && code < 200) subtype = 'NON_CURRENT'; // Financiación Básica
                else if (code >= 400 && code < 600) subtype = 'CURRENT'; // Acreedores
            } else if (acc.type === 'EQUITY') {
                subtype = 'EQUITY';
            }

            if (subtype) {
                updateStmt.run(subtype, acc.id);
                updatedCount++;
            }
        });

        // 3. Populate parent_id based on code structure
        console.log('Populating parent_id relationships...');
        const updateParent = db.prepare('UPDATE accounts SET parent_id = ? WHERE id = ?');
        let parentUpdates = 0;

        // Create map for quick lookup: code -> id
        const codeMap = {};
        accounts.forEach(a => codeMap[a.code] = a.id);

        accounts.forEach(acc => {
            // Strategy: 
            // 1. If code contains dots (e.g. 572.1), parent is 572
            // 2. If code is long (e.g. 4300001), parent might be 430
            let parentId = null;

            if (acc.code.includes('.')) {
                const parts = acc.code.split('.');
                parts.pop();
                const parentCode = parts.join('.');
                if (codeMap[parentCode]) parentId = codeMap[parentCode];
            } else if (acc.code.length > 3) {
                // Try 3 digit parent for 4+ digit accounts
                const parentCode = acc.code.substring(0, 3);
                if (codeMap[parentCode] && parentCode !== acc.code) parentId = codeMap[parentCode];
            }

            if (parentId) {
                updateParent.run(parentId, acc.id);
                parentUpdates++;
            }
        });
        console.log(`Updated parents for ${parentUpdates} accounts.`);
    });

    migrationTransaction();

    console.log(`Migration completed. Updated subtypes for ${updatedCount} accounts.`);

} catch (err) {
    console.error('Migration failed:', err);
}
