const db = require('../db');

exports.getAllAccounts = (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT a.*, 
            COALESCE(SUM(je.debit), 0) as total_debit, 
            COALESCE(SUM(je.credit), 0) as total_credit
            FROM accounts a
            LEFT JOIN journal_entries je ON a.id = je.account_id
            GROUP BY a.id
            ORDER BY a.code ASC
        `);
        const accounts = stmt.all();

        // Calculate net balance based on type
        const accountsWithBalance = accounts.map(acc => {
            let balance = 0;
            // Asset/Expense: Debit +, Credit -
            // Liability/Equity/Revenue: Credit +, Debit -
            if (['ASSET', 'EXPENSE'].includes(acc.type)) {
                balance = acc.total_debit - acc.total_credit;
            } else {
                balance = acc.total_credit - acc.total_debit;
            }
            return { ...acc, balance };
        });

        res.json(accountsWithBalance);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createAccount = (req, res) => {
    const { name, code, type, parent_id, initialBalance } = req.body;

    // Wrap in transaction for safety
    const createAccountTransaction = db.transaction(() => {
        let effectiveType = type;
        if (parent_id) {
            const parent = db.prepare('SELECT type FROM accounts WHERE id = ?').get(parent_id);
            if (parent) effectiveType = parent.type;
        }

        // 1. Create Account
        const stmt = db.prepare('INSERT INTO accounts (name, code, type, parent_id) VALUES (?, ?, ?, ?)');
        const info = stmt.run(name, code, effectiveType, parent_id);
        const newAccountId = info.lastInsertRowid;

        // 2. Handle Initial Balance
        if (initialBalance && parseFloat(initialBalance) !== 0) {
            const amount = parseFloat(initialBalance);
            const date = new Date().toISOString().split('T')[0];

            // Create Transaction Header
            const stmtTx = db.prepare('INSERT INTO transactions (date, description) VALUES (?, ?)');
            const txInfo = stmtTx.run(date, 'Saldo Inicial / Opening Balance');
            const txId = txInfo.lastInsertRowid;

            // Determine Debit/Credit based on Type
            // Assets/Expenses increase with Debit. Liabilities/Equity/Revenue increase with Credit.
            let mainEntry = {};
            let contraEntry = {};

            if (['ASSET', 'EXPENSE'].includes(type)) {
                mainEntry = { debit: amount, credit: 0 };
                contraEntry = { debit: 0, credit: amount };
            } else {
                mainEntry = { debit: 0, credit: amount };
                contraEntry = { debit: amount, credit: 0 };
            }

            // Insert Entry for New Account
            const stmtEntry = db.prepare('INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)');
            stmtEntry.run(txId, newAccountId, mainEntry.debit, mainEntry.credit);

            // Find or Create Contra Account (System Equity) to balance the ledger
            // We'll look for a code '9999' or name 'Ajustes Saldo Inicial'
            let contraAccountId;
            const stmtFindContra = db.prepare("SELECT id FROM accounts WHERE code = '9999'");
            const contraRow = stmtFindContra.get();

            if (contraRow) {
                contraAccountId = contraRow.id;
            } else {
                // Create it
                const stmtCreateContra = db.prepare("INSERT INTO accounts (name, code, type) VALUES (?, ?, ?)");
                const infoContra = stmtCreateContra.run('Ajustes Saldo Inicial', '9999', 'EQUITY');
                contraAccountId = infoContra.lastInsertRowid;
            }

            // Insert Contra Entry
            stmtEntry.run(txId, contraAccountId, contraEntry.debit, contraEntry.credit);
        }

        return { id: newAccountId, ...req.body };
    });

    try {
        const result = createAccountTransaction();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateAccount = (req, res) => {
    const { id } = req.params;
    const { name, code, type, parent_id, balance } = req.body;

    const updateTransaction = db.transaction(() => {
        let effectiveType = type;
        if (parent_id) {
            const parent = db.prepare('SELECT type FROM accounts WHERE id = ?').get(parent_id);
            if (parent) effectiveType = parent.type;
        }

        // 1. Update Account Details
        const stmt = db.prepare('UPDATE accounts SET name = ?, code = ?, type = ?, parent_id = ? WHERE id = ?');
        stmt.run(name, code, effectiveType, parent_id, id);

        // 1.5 Propagate type to all descendants
        const stmtUpdateDesc = db.prepare(`
            WITH RECURSIVE family(child_id) AS (
                SELECT id FROM accounts WHERE parent_id = ?
                UNION ALL
                SELECT a.id FROM accounts a, family f WHERE a.parent_id = f.child_id
            )
            UPDATE accounts SET type = ? WHERE id IN (SELECT child_id FROM family)
        `);
        stmtUpdateDesc.run(id, effectiveType);

        // 2. Handle Balance Adjustment if provided
        if (balance !== undefined && balance !== null && balance !== '') {
            const targetBalance = parseFloat(balance);

            // Calculate current balance
            // Asset/Expense: Debit - Credit
            // Liability/Equity/Revenue: Credit - Debit
            const stmtBal = db.prepare(`
                SELECT type, 
                COALESCE(SUM(je.debit), 0) as total_debit, 
                COALESCE(SUM(je.credit), 0) as total_credit
                FROM accounts a
                LEFT JOIN journal_entries je ON a.id = je.account_id
                WHERE a.id = ?
                GROUP BY a.id
            `);
            const row = stmtBal.get(id);

            // If data exists (it should), calc current. If newly created and no entries, it's 0.
            let currentBalance = 0;
            if (row) {
                if (['ASSET', 'EXPENSE'].includes(row.type)) {
                    currentBalance = row.total_debit - row.total_credit;
                } else {
                    currentBalance = row.total_credit - row.total_debit;
                }
            }

            const diff = targetBalance - currentBalance;

            // Only adjust if difference is significant (floating point safety)
            if (Math.abs(diff) > 0.001) {
                const date = new Date().toISOString().split('T')[0];
                const stmtTx = db.prepare('INSERT INTO transactions (date, description) VALUES (?, ?)');
                const txInfo = stmtTx.run(date, `Ajuste Manual / Balance Adjustment: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`);
                const txId = txInfo.lastInsertRowid;

                let mainEntry = {};
                let contraEntry = {};

                // To INCREASE balance (positive diff):
                // Asset/Expense: Debit
                // Liability/Equity: Credit

                // To DECREASE balance (negative diff):
                // Asset/Expense: Credit
                // Liability/Equity: Debit

                if (['ASSET', 'EXPENSE'].includes(type)) {
                    if (diff > 0) {
                        mainEntry = { debit: diff, credit: 0 };
                        contraEntry = { debit: 0, credit: diff };
                    } else {
                        mainEntry = { debit: 0, credit: Math.abs(diff) };
                        contraEntry = { debit: Math.abs(diff), credit: 0 };
                    }
                } else {
                    if (diff > 0) {
                        mainEntry = { debit: 0, credit: diff };
                        contraEntry = { debit: diff, credit: 0 };
                    } else {
                        mainEntry = { debit: Math.abs(diff), credit: 0 };
                        contraEntry = { debit: 0, credit: Math.abs(diff) };
                    }
                }

                // Insert Main Entry
                const stmtEntry = db.prepare('INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)');
                stmtEntry.run(txId, id, mainEntry.debit, mainEntry.credit);

                // Find/Create Contra Account (Equity)
                let contraAccountId;
                const stmtFindContra = db.prepare("SELECT id FROM accounts WHERE code = '9999'");
                const contraRow = stmtFindContra.get();

                if (contraRow) {
                    contraAccountId = contraRow.id;
                } else {
                    const stmtCreateContra = db.prepare("INSERT INTO accounts (name, code, type) VALUES (?, ?, ?)");
                    const infoContra = stmtCreateContra.run('Ajustes Saldo Inicial', '9999', 'EQUITY');
                    contraAccountId = infoContra.lastInsertRowid;
                }

                // Insert Contra Entry
                stmtEntry.run(txId, contraAccountId, contraEntry.debit, contraEntry.credit);
            }
        }
        return { id, ...req.body };
    });

    try {
        const result = updateTransaction();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteAccount = (req, res) => {
    const { id } = req.params;
    try {
        const deleteTransaction = db.transaction(() => {
            // 1. Get all descendents (including self) using Recursive CTE
            const stmtGetFamily = db.prepare(`
                WITH RECURSIVE family(id) AS (
                    VALUES(?)
                    UNION ALL
                    SELECT a.id FROM accounts a, family f WHERE a.parent_id = f.id
                )
                SELECT id FROM family
            `);
            const family = stmtGetFamily.all(id);
            const idsToDelete = family.map(f => f.id);

            if (idsToDelete.length > 0) {
                const placeholders = idsToDelete.map(() => '?').join(',');

                // 2. Delete Journal Entries associated with these accounts
                // Note: This leaves transactions (headers) potentially without entries or unbalanced.
                // For a personal app, this might be acceptable "force" behavior, or we could try to cleanup empty transactions.
                const stmtDeleteEntries = db.prepare(`DELETE FROM journal_entries WHERE account_id IN (${placeholders})`);
                stmtDeleteEntries.run(...idsToDelete);

                // 3. Delete the accounts
                const stmtDeleteAccounts = db.prepare(`DELETE FROM accounts WHERE id IN (${placeholders})`);
                stmtDeleteAccounts.run(...idsToDelete);
            }
        });

        deleteTransaction();
        res.json({ message: 'Account and associated data deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
