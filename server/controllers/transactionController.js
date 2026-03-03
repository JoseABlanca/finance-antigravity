const db = require('../db');

exports.getAllTransactions = (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT t.id, t.date, t.description, t.reference, 
                   json_group_array(json_object('account_id', je.account_id, 'debit', je.debit, 'credit', je.credit)) as entries
            FROM transactions t
            JOIN journal_entries je ON t.id = je.transaction_id
            GROUP BY t.id
            ORDER BY t.date DESC
        `);
        const transactions = stmt.all().map(t => ({
            ...t,
            entries: JSON.parse(t.entries)
        }));
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createTransaction = (req, res) => {
    const { date, description, reference, entries } = req.body; // entries: [{ account_id, debit, credit }]

    // Validation: Debits must equal Credits
    const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ error: 'Transaction is not balanced. Debits must equal Credits.' });
    }

    const insertTx = db.transaction(() => {
        const stmtTx = db.prepare('INSERT INTO transactions (date, description, reference) VALUES (?, ?, ?)');
        const info = stmtTx.run(date, description, reference);
        const transactionId = info.lastInsertRowid;

        const stmtEntry = db.prepare('INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)');
        for (const entry of entries) {
            stmtEntry.run(transactionId, entry.account_id, entry.debit || 0, entry.credit || 0);
        }
        return transactionId;
    });

    try {
        const id = insertTx();
        res.json({ id, message: 'Transaction recorded' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTransaction = (req, res) => {
    const { id } = req.params;
    try {
        const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
        const info = stmt.run(id);
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.json({ message: 'Transaction deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateTransaction = (req, res) => {
    const { id } = req.params;
    const { date, description, reference, entries } = req.body;

    // Validation: Debits must equal Credits
    const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ error: 'Transaction is not balanced. Debits must equal Credits.' });
    }

    const updateTx = db.transaction(() => {
        // 1. Check if Transaction Exists
        const txExists = db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(id);
        if (!txExists) throw new Error('Transaction not found');

        // 2. Update Transaction Details
        db.prepare('UPDATE transactions SET date = ?, description = ?, reference = ? WHERE id = ?')
            .run(date, description, reference, id);

        // 3. Delete Existing Journal Entries
        const deleteEntries = db.prepare('DELETE FROM journal_entries WHERE transaction_id = ?');
        deleteEntries.run(id);

        // 3. Insert New Entries
        const stmtEntry = db.prepare('INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)');
        for (const entry of entries) {
            stmtEntry.run(id, entry.account_id, entry.debit || 0, entry.credit || 0);
        }
    });

    try {
        updateTx();
        res.json({ message: 'Transaction updated successfully' });
    } catch (err) {
        if (err.message === 'Transaction not found') {
            res.status(404).json({ error: 'Transaction not found' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
};
