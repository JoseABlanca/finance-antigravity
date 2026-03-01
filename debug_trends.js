const db = require('./server/db');

console.log("Testing dashboard data query...");

try {
    const stmtBalances = db.prepare(`
       SELECT a.type, SUM(je.debit) as total_debit, SUM(je.credit) as total_credit
       FROM accounts a
       LEFT JOIN journal_entries je ON a.id = je.account_id
       GROUP BY a.type
    `);
    const balances = stmtBalances.all();
    console.log("Balances:", balances);

    const stmtMonthly = db.prepare(`
        SELECT strftime('%Y-%m', t.date) as month, a.type, SUM(je.credit - je.debit) as net_amount
        FROM transactions t
        JOIN journal_entries je ON t.id = je.transaction_id
        JOIN accounts a ON je.account_id = a.id
        WHERE a.type IN ('REVENUE', 'EXPENSE') AND t.date >= date('now', '-12 months')
        GROUP BY month, a.type
        ORDER BY month ASC
    `);
    const monthlyData = stmtMonthly.all();
    console.log("Monthly Data:", monthlyData);

} catch (err) {
    console.error("Error in dashboard data:", err);
}
