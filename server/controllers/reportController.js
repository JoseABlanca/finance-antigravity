const db = require('../db');
const { sendEmail } = require('../services/emailService');

exports.getFirstTransactionDate = (req, res) => {
    try {
        const result = db.prepare('SELECT MIN(date) as minDate FROM transactions').get();
        res.json({ minDate: result.minDate || new Date().toISOString().split('T')[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Helper to get date ranges for periods
const getPeriodRange = (year, period) => {
    if (!period || period === 'ANNUAL') {
        return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}` };
    }
    if (period.startsWith('M')) {
        let monthNum = period.substring(1);
        if (isNaN(parseInt(monthNum))) {
            monthNum = String(new Date().getMonth() + 1).padStart(2, '0');
        } else {
            monthNum = monthNum.padStart(2, '0');
        }

        const lastDay = new Date(year, parseInt(monthNum), 0).getDate();
        return {
            start: `${year}-${monthNum}-01`,
            end: `${year}-${monthNum}-${lastDay}`,
            label: `${monthNum}/${String(year).substring(2)}`
        };
    }
    return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}` };
};

const getComparisonPeriods = (year, period, count = 1, customRange = null) => {
    let periods = [];
    let currentYear = parseInt(year);

    if (customRange) {
        const { from, to, type } = customRange;
        if (type === 'ANNUAL') {
            for (let y = from.year; y <= to.year; y++) {
                periods.push(getPeriodRange(y, 'ANNUAL'));
            }
        } else {
            let currY = from.year;
            let currM = from.month;
            const endY = to.year;
            const endM = to.month;

            while (currY < endY || (currY === endY && currM <= endM)) {
                periods.push(getPeriodRange(currY, `M${String(currM).padStart(2, '0')}`));
                currM++;
                if (currM > 12) {
                    currM = 1;
                    currY++;
                }
            }
        }
        return periods;
    }

    if (!period || period === 'ANNUAL') {
        for (let i = count - 1; i >= 0; i--) {
            periods.push(getPeriodRange(currentYear - i, 'ANNUAL'));
        }
    } else {
        let targetPeriod = period.toUpperCase();
        let mIdx = 11;
        if (targetPeriod === 'MONTHLY') {
            const now = new Date();
            if (now.getFullYear() === currentYear) mIdx = now.getMonth();
        } else if (targetPeriod.startsWith('M')) {
            mIdx = parseInt(targetPeriod.substring(1)) - 1;
        }

        for (let i = count - 1; i >= 0; i--) {
            let targetMIdx = mIdx - i;
            let targetYear = currentYear;
            while (targetMIdx < 0) {
                targetMIdx += 12;
                targetYear -= 1;
            }
            const mStr = `M${String(targetMIdx + 1).padStart(2, '0')}`;
            periods.push(getPeriodRange(targetYear, mStr));
        }
    }
    return periods;
};

exports.sendReport = async (req, res) => {
    const { email } = req.body;
    try {
        const stmtBalances = db.prepare(`
           SELECT a.type, SUM(je.debit) as total_debit, SUM(je.credit) as total_credit
           FROM accounts a
           LEFT JOIN journal_entries je ON a.id = je.account_id
           GROUP BY a.type
        `);
        const balances = stmtBalances.all();

        let assets = 0, liabilities = 0, equity = 0, revenue = 0, expenses = 0;
        balances.forEach(b => {
            const netDr = (b.total_debit || 0) - (b.total_credit || 0);
            const netCr = (b.total_credit || 0) - (b.total_debit || 0);
            if (b.type === 'ASSET') assets += netDr;
            else if (b.type === 'LIABILITY') liabilities += netCr;
            else if (b.type === 'EQUITY') equity += netCr;
            else if (b.type === 'REVENUE') revenue += netCr;
            else if (b.type === 'EXPENSE') expenses += netDr;
        });

        const netWorth = assets - liabilities;
        const netIncome = revenue - expenses;

        const html = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background: #1a237e; color: white; padding: 24px;">
                    <h1 style="margin: 0;">Reporte Financiero</h1>
                    <p style="margin: 4px 0 0 0; opacity: 0.8;">Resumen Ejecutivo</p>
                </div>
                <div style="padding: 24px;">
                    <p>Hola,</p>
                    <p>Aquí tienes el resumen de tu estado financiero actual generado desde <strong>FinancePro</strong>.</p>
                </div>
            </div>`;
        const result = await sendEmail(email, 'Tu Reporte Financiero Personal', html);
        res.json({ message: 'Report sent successfully', previewUrl: result.previewUrl });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email: ' + err.message });
    }
};

exports.getBalanceSheet = (req, res) => {
    const { year, period, comparison } = req.query;
    try {
        let periods = [];
        if (comparison === 'custom') {
            const customRange = {
                from: { year: parseInt(req.query.fromYear), month: parseInt(req.query.fromMonth || '01') },
                to: { year: parseInt(req.query.toYear), month: parseInt(req.query.toMonth || '12') },
                type: period === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
            };
            periods = getComparisonPeriods(year, period, 1, customRange);
        } else if (comparison === 'true') {
            periods = getComparisonPeriods(year, period, 6);
        } else {
            periods = [getPeriodRange(year, period)];
        }

        const results = periods.map(p => {
            const stmt = db.prepare(`
                SELECT a.id, a.code, a.name, a.type, a.subtype, a.parent_id,
                       IFNULL(bal.total_debit, 0) as total_debit, IFNULL(bal.total_credit, 0) as total_credit
                FROM accounts a
                LEFT JOIN (
                    SELECT je.account_id, SUM(je.debit) as total_debit, SUM(je.credit) as total_credit
                    FROM journal_entries je
                    JOIN transactions t ON je.transaction_id = t.id
                    WHERE t.date <= ?
                    GROUP BY je.account_id
                ) bal ON a.id = bal.account_id
                WHERE a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
                GROUP BY a.id
            `);
            const rows = stmt.all(p.end);
            const accounts = rows.map(r => {
                let balance = 0;
                if (r.type === 'ASSET') balance = (r.total_debit || 0) - (r.total_credit || 0);
                else balance = (r.total_credit || 0) - (r.total_debit || 0);
                return { id: r.id, code: r.code, name: r.name, type: r.type, subtype: r.subtype, parent_id: r.parent_id, balance };
            });
            return { period: p.label, accounts };
        });

        res.json({ year, period, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProfitAndLoss = (req, res) => {
    const { year, period, comparison } = req.query;
    try {
        let periods = [];
        if (comparison === 'custom') {
            const customRange = {
                from: { year: parseInt(req.query.fromYear), month: parseInt(req.query.fromMonth || '01') },
                to: { year: parseInt(req.query.toYear), month: parseInt(req.query.toMonth || '12') },
                type: period === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
            };
            periods = getComparisonPeriods(year, period, 1, customRange);
        } else if (comparison === 'true') {
            periods = getComparisonPeriods(year, period, 6);
        } else {
            periods = [getPeriodRange(year, period)];
        }

        const results = periods.map(p => {
            const stmt = db.prepare(`
                SELECT a.id, a.code, a.name, a.type, 
                       SUM(je.debit) as total_debit, SUM(je.credit) as total_credit
                FROM accounts a
                JOIN journal_entries je ON a.id = je.account_id
                JOIN transactions t ON je.transaction_id = t.id
                WHERE a.type IN ('REVENUE', 'EXPENSE')
                  AND t.date BETWEEN ? AND ?
                GROUP BY a.id
            `);
            const rows = stmt.all(p.start, p.end);
            const accounts = rows.map(r => {
                let balance = 0;
                if (r.type === 'EXPENSE') balance = (r.total_debit || 0) - (r.total_credit || 0);
                else balance = (r.total_credit || 0) - (r.total_debit || 0);
                return { id: r.id, code: r.code, name: r.name, type: r.type, balance };
            });
            return { period: p.label, accounts };
        });

        res.json({ year, period, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getCashFlow = (req, res) => {
    const { year, period, comparison } = req.query;
    try {
        let periods = [];
        if (comparison === 'custom') {
            const customRange = {
                from: { year: parseInt(req.query.fromYear), month: parseInt(req.query.fromMonth || '01') },
                to: { year: parseInt(req.query.toYear), month: parseInt(req.query.toMonth || '12') },
                type: period === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
            };
            periods = getComparisonPeriods(year, period, 1, customRange);
        } else if (comparison === 'true') {
            periods = getComparisonPeriods(year, period, 6);
        } else {
            periods = [getPeriodRange(year, period)];
        }

        const stmtLiquidIds = db.prepare(`SELECT id FROM accounts WHERE code LIKE '57%'`);
        const liquidAccountIds = stmtLiquidIds.all().map(a => a.id);
        if (liquidAccountIds.length === 0) return res.json({ year, results: [] });

        const results = periods.map(p => {
            const stmtMoves = db.prepare(`
                SELECT a.type as category,
                SUM(CASE WHEN je.debit > 0 THEN je.debit ELSE -je.credit END) as net_cash
                FROM journal_entries je
                JOIN transactions t ON je.transaction_id = t.id
                JOIN journal_entries other ON t.id = other.transaction_id AND other.id != je.id
                JOIN accounts a ON other.account_id = a.id
                WHERE je.account_id IN (${liquidAccountIds.join(',')})
                  AND t.date BETWEEN ? AND ?
                GROUP BY a.type
            `);
            const activities = stmtMoves.all(p.start, p.end);
            return { period: p.label, activities };
        });

        res.json({ year, period, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getFinancialTrends = (req, res) => {
    const { type } = req.query;
    const limit = type === 'MONTHLY' ? 12 : type === 'QUARTERLY' ? 8 : 5;
    try {
        const periodFormat = type === 'MONTHLY' ? `strftime('%Y-%m', t.date)` :
            type === 'QUARTERLY' ? `CASE 
                WHEN strftime('%m', t.date) BETWEEN '01' AND '03' THEN strftime('%Y', t.date) || '-Q1'
                WHEN strftime('%m', t.date) BETWEEN '04' AND '06' THEN strftime('%Y', t.date) || '-Q2'
                WHEN strftime('%m', t.date) BETWEEN '07' AND '09' THEN strftime('%Y', t.date) || '-Q3'
                ELSE strftime('%Y', t.date) || '-Q4'
            END` : `strftime('%Y', t.date)`;

        const stmtPeriods = db.prepare(`SELECT ${periodFormat} as period, MAX(t.date) as end_date FROM transactions t GROUP BY period ORDER BY period DESC LIMIT ?`);
        const periods = stmtPeriods.all(limit).reverse();
        const results = periods.map(p => {
            const balance = db.prepare(`SELECT 
                SUM(CASE WHEN a.type = 'ASSET' THEN je.debit - je.credit ELSE 0 END) as total_assets,
                SUM(CASE WHEN a.type = 'LIABILITY' THEN je.credit - je.debit ELSE 0 END) as total_liabilities
                FROM journal_entries je JOIN transactions t ON je.transaction_id = t.id JOIN accounts a ON je.account_id = a.id WHERE t.date <= ?`).get(p.end_date);
            return { period: p.period, total_assets: balance.total_assets || 0, total_liabilities: balance.total_liabilities || 0 };
        });
        res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getDashboardData = (req, res) => {
    try {
        const stmtBalances = db.prepare(`SELECT a.type, SUM(je.debit) as total_debit, SUM(je.credit) as total_credit FROM accounts a LEFT JOIN journal_entries je ON a.id = je.account_id GROUP BY a.type`);
        const balances = stmtBalances.all();
        let assets = 0, liabilities = 0, revenue = 0, expenses = 0;
        balances.forEach(b => {
            if (b.type === 'ASSET') assets += (b.total_debit - b.total_credit);
            else if (b.type === 'LIABILITY') liabilities += (b.total_credit - b.total_debit);
            else if (b.type === 'REVENUE') revenue += (b.total_credit - b.total_debit);
            else if (b.type === 'EXPENSE') expenses += (b.total_debit - b.total_credit);
        });
        res.json({ summary: { netWorth: assets - liabilities, assets, liabilities, netIncome: revenue - expenses } });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
