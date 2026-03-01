
exports.recordTrade = (req, res) => {
    // This function records a trade AND the accounting entries
    const { date, symbol, action, quantity, price, fee, currency, exchange_rate, cashAccountId, assetAccountId } = req.body;

    // Ensure numbers
    const qty = parseFloat(quantity);
    const px = parseFloat(price);
    const fx = parseFloat(exchange_rate || 1.0);
    const fees = parseFloat(fee || 0);

    const totalAmountNative = qty * px;
    const totalAmountEUR = totalAmountNative * fx;

    const feesEUR = fees * fx;

    const insertTrade = db.transaction(() => {
        // 1. Transaction Header
        const stmtTx = db.prepare('INSERT INTO transactions (date, description, reference) VALUES (?, ?, ?)');
        const desc = `${action} ${qty} ${symbol} @ ${px} (${currency || 'EUR'})`;
        const info = stmtTx.run(date, desc, 'TRADE');
        const transactionId = info.lastInsertRowid;

        // 2. Investment Trade Record
        const stmtTrade = db.prepare(`
            INSERT INTO investment_trades (transaction_id, symbol, action, quantity, price, fee, currency, exchange_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmtTrade.run(transactionId, symbol, action, qty, px, fees, currency || 'EUR', fx);

        // 3. Journal Entries
        const stmtEntry = db.prepare('INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)');

        if (action === 'BUY') {
            const costBasis = totalAmountEUR + feesEUR;
            // Debit Asset (Increase), Credit Cash (Decrease)
            stmtEntry.run(transactionId, assetAccountId, costBasis, 0); // Asset
            stmtEntry.run(transactionId, cashAccountId, 0, costBasis);   // Cash
        } else if (action === 'SELL') {
            const proceeds = totalAmountEUR - feesEUR;
            // Debit Cash (Increase), Credit Asset (Decrease) 
            stmtEntry.run(transactionId, cashAccountId, proceeds, 0);   // Cash
            stmtEntry.run(transactionId, assetAccountId, 0, proceeds); // Asset reduction
        }

        return transactionId;
    });

    try {
        const id = insertTrade();
        res.json({ id, message: 'Trade recorded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateTrade = (req, res) => {
    const { id } = req.params; // investment_trade id
    const { date, symbol, action, quantity, price, fee, currency, exchange_rate, cashAccountId, assetAccountId } = req.body;

    // We need to update:
    // 1. Transaction Header (date, description)
    // 2. Investment Trade Record (symbol, action, etc.)
    // 3. Journal Entries (amounts converted to EUR)

    const updateTx = db.transaction(() => {
        // Get existing record to find transaction_id
        const existing = db.prepare('SELECT * FROM investment_trades WHERE id = ?').get(id);
        if (!existing) throw new Error('Trade not found');

        const transactionId = existing.transaction_id;

        // 1. Update Transaction
        const desc = `${action} ${quantity} ${symbol} @ ${price} (${currency || 'EUR'})`;
        db.prepare('UPDATE transactions SET date = ?, description = ? WHERE id = ?').run(date, desc, transactionId);

        // 2. Update Trade Record
        db.prepare(`
            UPDATE investment_trades 
            SET symbol = ?, action = ?, quantity = ?, price = ?, fee = ?, currency = ?, exchange_rate = ?
            WHERE id = ?
        `).run(symbol, action, quantity, price, fee || 0, currency || 'EUR', exchange_rate || 1.0, id);

        // 3. Update Journal Entries
        // Delete old entries and recreate them (simplest way to ensure correctness)
        db.prepare('DELETE FROM journal_entries WHERE transaction_id = ?').run(transactionId);

        // Re-calculate totals in Base Currency (EUR)
        // Ensure inputs are numbers
        const qty = parseFloat(quantity);
        const px = parseFloat(price);
        const fx = parseFloat(exchange_rate || 1.0);
        const fees = parseFloat(fee || 0);

        const totalAmountNative = qty * px;
        const totalAmountEUR = totalAmountNative * fx;
        const feesEUR = fees * fx;

        // Re-insert entries
        const stmtEntry = db.prepare('INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)');

        if (action === 'BUY') {
            const costBasis = totalAmountEUR + feesEUR;
            stmtEntry.run(transactionId, assetAccountId, costBasis, 0);
            stmtEntry.run(transactionId, cashAccountId, 0, costBasis);
        } else if (action === 'SELL') {
            const proceeds = totalAmountEUR - feesEUR;

            stmtEntry.run(transactionId, cashAccountId, proceeds, 0);
            stmtEntry.run(transactionId, assetAccountId, 0, totalAmountEUR);
            stmtEntry.run(transactionId, assetAccountId, 0, proceeds);
        }
    });

    try {
        updateTx();
        res.json({ message: 'Trade updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};


exports.deleteTrade = (req, res) => {
    const { id } = req.params;

    const deleteTx = db.transaction(() => {
        const existing = db.prepare('SELECT transaction_id FROM investment_trades WHERE id = ?').get(id);
        if (!existing) return;
        db.prepare('DELETE FROM transactions WHERE id = ?').run(existing.transaction_id);
    });

    try {
        deleteTx();
        res.json({ message: 'Trade deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPortfolio = (req, res) => {
    // Get all trades and aggregate
    try {
        const stmt = db.prepare(`
            SELECT it.*, t.date, t.description 
            FROM investment_trades it
            JOIN transactions t ON it.transaction_id = t.id
            ORDER BY date(t.date) DESC
        `);
        const trades = stmt.all();
        res.json(trades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
