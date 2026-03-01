const db = require('../db');
const { sendEmail } = require('../services/emailService');

// Helper to get date ranges for periods
const getPeriodRange = (year, period) => {
    if (!period || period === 'ANNUAL') {
        return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}` };
    }
    const qMap = {
        'Q1': { start: `${year}-01-01`, end: `${year}-03-31`, label: `Q1 ${year}` },
        'Q2': { start: `${year}-04-01`, end: `${year}-06-30`, label: `Q2 ${year}` },
        'Q3': { start: `${year}-07-01`, end: `${year}-09-30`, label: `Q3 ${year}` },
        'Q4': { start: `${year}-10-01`, end: `${year}-12-31`, label: `Q4 ${year}` }
    };
    return qMap[period.toUpperCase()] || { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}` };
};

const getComparisonPeriods = (year, period, count = 4) => {
    let periods = [];
    let currentYear = parseInt(year);

    if (!period || period === 'ANNUAL') {
        for (let i = count - 1; i >= 0; i--) {
            periods.push(getPeriodRange(currentYear - i, 'ANNUAL'));
        }
    } else {
        const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        let targetPeriod = period.toUpperCase();

        if (targetPeriod === 'QUARTERLY') {
            const now = new Date();
            const nowYear = now.getFullYear();
            if (nowYear === currentYear) {
                const month = now.getMonth() + 1;
                if (month <= 3) targetPeriod = 'Q1';
                else if (month <= 6) targetPeriod = 'Q2';
                else if (month <= 9) targetPeriod = 'Q3';
                else targetPeriod = 'Q4';
            } else {
                targetPeriod = 'Q4';
            }
        }

        let qIdx = quarters.indexOf(targetPeriod);
        if (qIdx === -1) qIdx = 3; // Default to Q4

        for (let i = count - 1; i >= 0; i--) {
            let targetQIdx = qIdx - i;
            let targetYear = currentYear;
            while (targetQIdx < 0) {
                targetQIdx += 4;
                targetYear -= 1;
            }
            periods.push(getPeriodRange(targetYear, quarters[targetQIdx]));
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
                    
                    <div style="display: flex; gap: 16px; margin: 24px 0;">
                        <div style="flex: 1; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center;">
                            <div style="font-size: 12px; text-transform: uppercase; color: #666; font-weight: bold;">Patrimonio Neto</div>
                            <div style="font-size: 24px; font-weight: bold; color: #1a237e; margin-top: 8px;">
                                ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(netWorth)}
                            </div>
                        </div>
                        <div style="flex: 1; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center;">
                            <div style="font-size: 12px; text-transform: uppercase; color: #666; font-weight: bold;">Resultado Neto</div>
                            <div style="font-size: 24px; font-weight: bold; color: ${netIncome >= 0 ? '#2e7d32' : '#c62828'}; margin-top: 8px;">
                                ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(netIncome)}
                            </div>
                        </div>
                    </div>

                    <h3 style="border-bottom: 2px solid #eee; padding-bottom: 8px;">Desglose General</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 12px 0;">Activos Totales</td>
                            <td style="text-align: right; font-weight: bold;">${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(assets)}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 12px 0;">Pasivos Totales</td>
                            <td style="text-align: right; font-weight: bold;">${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(liabilities)}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 12px 0;">Ingresos (Total Histórico)</td>
                            <td style="text-align: right; font-weight: bold; color: #2e7d32;">${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(revenue)}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 12px 0;">Gastos (Total Histórico)</td>
                            <td style="text-align: right; font-weight: bold; color: #c62828;">${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(expenses)}</td>
                        </tr>
                    </table>

                    <p style="margin-top: 32px; font-size: 12px; color: #999; text-align: center;">
                        Este reporte fue generado automáticamente el ${new Date().toLocaleDateString('es-ES')}.
                    </p>
                </div>
            </div>
        `;

        const result = await sendEmail(email, 'Tu Reporte Financiero Personal', html);
        res.json({ message: 'Report sent successfully', previewUrl: result.previewUrl });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email: ' + err.message });
    }
};

exports.getBalanceSheet = (req, res) => {
    const { year, period, comparison } = req.query;
    if (!year) return res.status(400).json({ error: 'Year is required' });

    try {
        const periods = comparison === 'true' ? getComparisonPeriods(year, period) : [getPeriodRange(year, period)];

        const results = periods.map(p => {
            const stmt = db.prepare(`
                SELECT a.id, a.code, a.name, a.type, a.subtype, a.parent_id,
                       SUM(je.debit) as total_debit, SUM(je.credit) as total_credit
                FROM accounts a
                LEFT JOIN journal_entries je ON a.id = je.account_id
                LEFT JOIN transactions t ON je.transaction_id = t.id
                WHERE a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
                  AND (t.date IS NULL OR t.date <= ?)
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

        res.json({ year, period: period || 'ANNUAL', comparison: comparison === 'true', results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProfitAndLoss = (req, res) => {
    const { year, period, comparison } = req.query;
    if (!year) return res.status(400).json({ error: 'Year is required' });

    try {
        const periods = comparison === 'true' ? getComparisonPeriods(year, period) : [getPeriodRange(year, period)];

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

        res.json({ year, period: period || 'ANNUAL', comparison: comparison === 'true', results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getCashFlow = (req, res) => {
    const { year, period } = req.query;
    if (!year) return res.status(400).json({ error: 'Year is required' });

    try {
        const { start, end } = getPeriodRange(year, period);

        // Simplified Cash Flow: All movements in liquid accounts (Bancos/Caja)
        // Categorized by the OTHER side of the entry
        const stmtLiquidIds = db.prepare(`SELECT id FROM accounts WHERE code LIKE '57%'`);
        const liquidAccountIds = stmtLiquidIds.all().map(a => a.id);

        if (liquidAccountIds.length === 0) return res.json({ year, activities: [] });

        const stmtMoves = db.prepare(`
            SELECT 
                a.type as category,
                SUM(CASE WHEN je.debit > 0 THEN je.debit ELSE -je.credit END) as net_cash
            FROM journal_entries je
            JOIN transactions t ON je.transaction_id = t.id
            JOIN journal_entries other ON t.id = other.transaction_id AND other.id != je.id
            JOIN accounts a ON other.account_id = a.id
            WHERE je.account_id IN (${liquidAccountIds.join(',')})
              AND t.date BETWEEN ? AND ?
            GROUP BY a.type
        `);

        const activities = stmtMoves.all(start, end);
        res.json({ year, period: period || 'ANNUAL', activities });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getFinancialTrends = (req, res) => {
    const { type } = req.query; // 'ANNUAL' or 'QUARTERLY'
    const limit = type === 'QUARTERLY' ? 8 : 5;

    try {
        const periodFormat = type === 'QUARTERLY' ?
            `CASE 
                WHEN strftime('%m', t.date) BETWEEN '01' AND '03' THEN strftime('%Y', t.date) || '-Q1'
                WHEN strftime('%m', t.date) BETWEEN '04' AND '06' THEN strftime('%Y', t.date) || '-Q2'
                WHEN strftime('%m', t.date) BETWEEN '07' AND '09' THEN strftime('%Y', t.date) || '-Q3'
                ELSE strftime('%Y', t.date) || '-Q4'
            END` : `strftime('%Y', t.date)`;

        // 1. Get periods and basic movements
        const stmtPeriods = db.prepare(`
            SELECT 
                ${periodFormat} as period,
                MAX(t.date) as end_date,
                SUM(CASE WHEN a.type = 'REVENUE' THEN je.credit - je.debit ELSE 0 END) as revenue,
                SUM(CASE WHEN a.type = 'EXPENSE' THEN je.debit - je.credit ELSE 0 END) as expense,
                SUM(CASE WHEN a.code LIKE '70%' THEN je.credit - je.debit ELSE 0 END) as sales,
                SUM(CASE WHEN a.code LIKE '60%' THEN je.debit - je.credit ELSE 0 END) as cogs,
                SUM(CASE WHEN a.type = 'REVENUE' AND a.code NOT LIKE '70%' THEN je.credit - je.debit ELSE 0 END) as other_revenue,
                SUM(CASE WHEN a.type = 'EXPENSE' AND a.code NOT LIKE '60%' THEN je.debit - je.credit ELSE 0 END) as other_expense
            FROM transactions t
            JOIN journal_entries je ON t.id = je.transaction_id
            JOIN accounts a ON je.account_id = a.id
            GROUP BY period
            ORDER BY period DESC
            LIMIT ?
        `);
        const periods = stmtPeriods.all(limit).reverse();


        // 2. Liquid accounts for Cash Flow
        const stmtLiquidIds = db.prepare(`SELECT id FROM accounts WHERE code LIKE '57%'`);
        const liquidIds = stmtLiquidIds.all().map(a => a.id);

        // 3. For each period, calculate Cumulative Balance and Detailed Cash Flow
        const results = periods.map(p => {
            // Absolute Balance Positions at end_date
            const balance = db.prepare(`
                SELECT 
                    SUM(CASE WHEN a.type = 'ASSET' THEN je.debit - je.credit ELSE 0 END) as total_assets,
                    SUM(CASE WHEN a.type = 'LIABILITY' THEN je.credit - je.debit ELSE 0 END) as total_liabilities,
                    SUM(CASE WHEN a.type = 'EQUITY' THEN je.credit - je.debit ELSE 0 END) as total_equity
                FROM journal_entries je
                JOIN transactions t ON je.transaction_id = t.id
                JOIN accounts a ON je.account_id = a.id
                WHERE t.date <= ?
            `).get(p.end_date);

            // Detailed Cash Flow for this period
            let cf = { op_cf: 0, inv_cf: 0, fin_cf: 0 };
            if (liquidIds.length > 0) {
                const stmtCF = db.prepare(`
                    SELECT 
                        SUM(CASE WHEN (oa.type IN ('REVENUE', 'EXPENSE') OR oa.code LIKE '4%' OR oa.code LIKE '56%') THEN je.debit - je.credit ELSE 0 END) as op_cf,
                        SUM(CASE WHEN oa.code LIKE '2%' THEN je.debit - je.credit ELSE 0 END) as inv_cf,
                        SUM(CASE WHEN (oa.code LIKE '1%' OR oa.code LIKE '17%' OR oa.code LIKE '52%') THEN je.debit - je.credit ELSE 0 END) as fin_cf
                    FROM journal_entries je
                    JOIN transactions t ON je.transaction_id = t.id
                    JOIN journal_entries other ON t.id = other.transaction_id AND other.id != je.id
                    JOIN accounts oa ON other.account_id = oa.id
                    WHERE je.account_id IN (${liquidIds.join(',')})
                      AND ${periodFormat} = ?
                `);
                cf = stmtCF.get(p.period);
            }

            return {
                period: p.period,
                revenue: p.revenue,
                expense: p.expense,
                gross_profit: p.sales - p.cogs,
                operating_result: (p.sales - p.cogs) + (p.other_revenue - p.other_expense),
                net_result: p.revenue - p.expense,
                total_assets: balance.total_assets || 0,
                total_liabilities: balance.total_liabilities || 0,
                total_equity: (balance.total_assets || 0) - (balance.total_liabilities || 0), // Standard Net Worth
                op_cf: cf.op_cf || 0,
                inv_cf: cf.inv_cf || 0,
                fin_cf: cf.fin_cf || 0,
                fcf: (cf.op_cf || 0) + (cf.inv_cf || 0) // Free Cash Flow = Op + Inv (Inv is usually negative for Capex)
            };
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getDashboardData = (req, res) => {
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
        const months = [...new Set(monthlyData.map(m => m.month))];
        const incomeData = months.map(m => {
            const row = monthlyData.find(d => d.month === m && d.type === 'REVENUE');
            return row ? row.net_amount : 0;
        });
        const expenseData = months.map(m => {
            const row = monthlyData.find(d => d.month === m && d.type === 'EXPENSE');
            return row ? Math.abs(row.net_amount) : 0;
        });

        res.json({
            summary: {
                netWorth,
                assets,
                liabilities,
                netIncome: revenue - expenses
            },
            chart: {
                labels: months,
                income: incomeData,
                expense: expenseData
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
