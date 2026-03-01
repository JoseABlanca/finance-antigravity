const db = require('../db');
const YahooFinance = require('yahoo-finance2').default;
const fs = require('fs');
const path = require('path');

// --- INVESTMENT METRICS HELPERS ---

const p = (num) => (num * 100).toFixed(2) + "%";
const n = (num) => num ? num.toFixed(2) : "0.00";

const calculateStats = (returns) => {
    if (returns.length === 0) return { skew: 0, kurtosis: 0, vaR: 0, cVaR: 0, gainPain: 0, tailRatio: 0, commonSense: 0 };
    const n_count = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n_count;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n_count;
    const stdDev = Math.sqrt(variance);

    const skew = stdDev === 0 ? 0 : (returns.reduce((a, b) => a + Math.pow(b - mean, 3), 0) / n_count) / Math.pow(stdDev, 3);
    const kurtosis = stdDev === 0 ? 0 : ((returns.reduce((a, b) => a + Math.pow(b - mean, 4), 0) / n_count) / Math.pow(stdDev, 4)) - 3;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index95 = Math.floor(n_count * 0.05);
    const vaR = sortedReturns[index95] || 0;

    const tailLosses = sortedReturns.slice(0, index95);
    const cVaR = tailLosses.length > 0 ? tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length : vaR;

    const sumGains = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const sumLosses = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const gainPain = sumLosses > 0 ? sumGains / sumLosses : 0;

    const index05 = Math.floor(n_count * 0.05);
    const index95_right = Math.floor(n_count * 0.95);
    const val05 = Math.abs(sortedReturns[index05]);
    const val95 = sortedReturns[index95_right];
    const tailRatio = val05 > 0 ? (val95 || 0) / val05 : 0;

    const winRate = returns.filter(r => r > 0).length / n_count;
    const avgWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0) / (returns.filter(r => r > 0).length || 1);
    const avgLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0) / (returns.filter(r => r < 0).length || 1));
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const negRetSum = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const profitFactor = negRetSum > 0 ? (returns.filter(r => r > 0).reduce((a, b) => a + b, 0)) / negRetSum : 0;
    const cpcIndex = profitFactor * winRate * payoffRatio;

    const sortedWins = returns.filter(r => r > 0).sort((a, b) => b - a);
    const sortedLosses = returns.filter(r => r < 0).sort((a, b) => a - b);
    const avgTop5Wins = sortedWins.slice(0, 5).reduce((a, b) => a + b, 0) / (Math.min(5, sortedWins.length) || 1);
    const avgTop5Losses = Math.abs(sortedLosses.slice(0, 5).reduce((a, b) => a + b, 0) / (Math.min(5, sortedLosses.length) || 1));
    const outlierWinRatio = avgWin > 0 ? avgTop5Wins / avgWin : 0;
    const outlierLossRatio = avgLoss > 0 ? avgTop5Losses / avgLoss : 0;

    return { skew, kurtosis, vaR, cVaR, gainPain, tailRatio, cpcIndex, outlierWinRatio, outlierLossRatio, riskOfRuin: 0 };
};

const calculateUlcerIndex = (prices) => {
    if (!prices || prices.length === 0) return 0;
    let peak = prices[0];
    let squaredDrawdowns = [];
    for (let p of prices) {
        if (p > peak) peak = p;
        const dd = ((p - peak) / peak) * 100;
        squaredDrawdowns.push(dd * dd);
    }
    const meanSquaredDD = squaredDrawdowns.reduce((a, b) => a + b, 0) / squaredDrawdowns.length;
    return Math.sqrt(meanSquaredDD);
};

const calculateRSquared = (yTrue, yPred) => {
    const n_count = yTrue.length;
    if (n_count !== yPred.length || n_count === 0) return 0;
    const meanY = yTrue.reduce((a, b) => a + b, 0) / n_count;
    const meanX = yPred.reduce((a, b) => a + b, 0) / n_count;
    const numerator = yTrue.reduce((sum, yi, i) => sum + (yi - meanY) * (yPred[i] - meanX), 0);
    const denom1 = yTrue.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const denom2 = yPred.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0);
    const denominator = Math.sqrt(denom1) * Math.sqrt(denom2);
    if (denominator === 0) return 0;
    return Math.pow(numerator / denominator, 2);
};

const calculatePeriodReturns = (prices, dates) => {
    if (!prices || prices.length === 0) return { mtd: 0, ytd: 0, r3m: 0, r6m: 0, r1y: 0, r3y: 0, r5y: 0 };
    const latestPrice = prices[prices.length - 1];
    const latestDate = new Date(dates[dates.length - 1]);

    const getPriceXAgo = (days) => {
        const targetDate = new Date(latestDate);
        targetDate.setDate(targetDate.getDate() - days);
        let foundIndex = -1;
        for (let i = dates.length - 1; i >= 0; i--) {
            if (new Date(dates[i]) <= targetDate) {
                foundIndex = i;
                break;
            }
        }
        return foundIndex >= 0 ? prices[foundIndex] : prices[0];
    };

    const currentMonth = latestDate.getMonth();
    const currentYear = latestDate.getFullYear();
    let mtdIndex = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
        const d = new Date(dates[i]);
        if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) {
            mtdIndex = i + 1;
            break;
        }
    }
    const mtdPrice = prices[mtdIndex] || prices[0];
    const mtd = (latestPrice - mtdPrice) / mtdPrice;

    let ytdIndex = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
        const d = new Date(dates[i]);
        if (d.getFullYear() !== currentYear) {
            ytdIndex = i + 1;
            break;
        }
    }
    const ytdPrice = prices[ytdIndex] || prices[0];
    const ytd = (latestPrice - ytdPrice) / ytdPrice;

    const r3m = (latestPrice - getPriceXAgo(90)) / getPriceXAgo(90);
    const r6m = (latestPrice - getPriceXAgo(180)) / getPriceXAgo(180);
    const r1y = (latestPrice - getPriceXAgo(365)) / getPriceXAgo(365);
    const r3y = (Math.pow(latestPrice / getPriceXAgo(365 * 3), 1 / 3) - 1);
    const r5y = (Math.pow(latestPrice / getPriceXAgo(365 * 5), 1 / 5) - 1);

    return { mtd, ytd, r3m, r6m, r1y, r3y: isNaN(r3y) ? 0 : r3y, r5y: isNaN(r5y) ? 0 : r5y };
};

const calculateMonthlyReturnsHelper = (priceData) => {
    const map = {};
    priceData.forEach(r => {
        const monthKey = new Date(r.date).toISOString().substring(0, 7);
        if (!map[monthKey]) map[monthKey] = { start: r.close || r, end: r.close || r };
        map[monthKey].end = r.close || r;
    });
    return Object.entries(map).map(([key, m]) => ({
        month: key,
        return: (m.end - m.start) / m.start
    }));
};

const calculateWorstDrawdowns = (priceData) => {
    const drawdowns = [];
    if (!priceData || priceData.length === 0) return [];

    const isQuotes = priceData[0].close !== undefined;
    let peak = isQuotes ? priceData[0].close : priceData[0];
    let peakDate = isQuotes ? priceData[0].date : null;
    let inDrawdown = false;
    let ddStartPeak = null;
    let ddStartDate = null;
    let lowestPrice = null;

    for (let i = 0; i < priceData.length; i++) {
        const price = isQuotes ? priceData[i].close : priceData[i];
        const date = isQuotes ? priceData[i].date : i;

        if (price > peak) {
            if (inDrawdown && ddStartPeak !== null && lowestPrice !== null) {
                const dd = (lowestPrice - ddStartPeak) / ddStartPeak;
                const days = ddStartDate ? Math.floor((new Date(date) - new Date(ddStartDate)) / (1000 * 60 * 60 * 24)) : 0;
                drawdowns.push({
                    started: ddStartDate ? new Date(ddStartDate).toISOString().split('T')[0] : 'Day ' + i,
                    recovered: date ? new Date(date).toISOString().split('T')[0] : 'Day ' + i,
                    drawdown: (dd * 100).toFixed(2) + '%',
                    days: days
                });
            }
            peak = price;
            peakDate = date;
            inDrawdown = false;
            ddStartPeak = null;
            lowestPrice = null;
        } else if (price < peak) {
            if (!inDrawdown) {
                inDrawdown = true;
                ddStartPeak = peak;
                ddStartDate = peakDate;
                lowestPrice = price;
            } else {
                if (price < lowestPrice) lowestPrice = price;
            }
        }
    }

    if (inDrawdown && ddStartPeak !== null && lowestPrice !== null) {
        const dd = (lowestPrice - ddStartPeak) / ddStartPeak;
        drawdowns.push({
            started: ddStartDate ? new Date(ddStartDate).toISOString().split('T')[0] : 'Start',
            recovered: '-',
            drawdown: (dd * 100).toFixed(2) + '%',
            days: 0
        });
    }

    return drawdowns.sort((a, b) => parseFloat(a.drawdown) - parseFloat(b.drawdown)).slice(0, 10);
};

const calculateBetaHelper = (stratPrices, benchPrices) => {
    if (stratPrices.length < 2 || benchPrices.length < 2) return 0;
    const stratReturns = [];
    const benchReturns = [];
    for (let j = 1; j < stratPrices.length; j++) {
        stratReturns.push((stratPrices[j] - stratPrices[j - 1]) / stratPrices[j - 1]);
        benchReturns.push((benchPrices[j] - benchPrices[j - 1]) / benchPrices[j - 1]);
    }
    const stratMean = stratReturns.reduce((a, b) => a + b, 0) / stratReturns.length;
    const benchMean = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;
    let covariance = 0;
    let benchVariance = 0;
    for (let j = 0; j < stratReturns.length; j++) {
        covariance += (stratReturns[j] - stratMean) * (benchReturns[j] - benchMean);
        benchVariance += Math.pow(benchReturns[j] - benchMean, 2);
    }
    if (benchVariance === 0) return 0;
    return (covariance / stratReturns.length) / (benchVariance / benchReturns.length);
};

const calculateMetrics = (data, name) => {
    if (!data || data.length < 2) {
        return {
            prices: [], dailyReturns: [], cagr: 0, volatility: 0, sharpe: 0, sortino: 0,
            maxDrawdown: 0, longestDDDays: 0, avgDrawdown: 0, avgDrawdownDays: 0,
            cumulativeReturns: [], worst5Drawdowns: [], avgWin: 0, avgLoss: 0,
            meanReturn: 0, stdDev: 0, bestDay: 0, worstDay: 0,
            winRate: 0, payoffRatio: 0, profitFactor: 0,
            skew: 0, kurtosis: 0, vaR: 0, cVaR: 0, gainPain: 0,
            maxConsecutiveGainDays: 0, maxConsecutiveLossDays: 0,
            winYears: 0, winQuarters: 0, winMonths: 0, winDays: 0,
            currentPrice: 0, recoveryFactor: 0, ulcerIndex: 0,
            avgUpMonth: 0, avgDownMonth: 0, bestMonth: 0, worstMonth: 0
        };
    }
    const prices = data.map(r => r.close || r);
    const dates = data.map(r => r.date || new Date().toISOString());
    const dailyReturns = [];

    // New: Track daily returns with dates
    const dailyReturnsWithDates = [];
    for (let i = 1; i < prices.length; i++) {
        const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
        dailyReturns.push(ret);
        dailyReturnsWithDates.push({
            date: new Date(dates[i]).toISOString().split('T')[0],
            value: ret,
            price: prices[i]
        });
    }

    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    const totalDays = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (1000 * 60 * 60 * 24);
    const yearsActual = totalDays / 365.25;

    const cagr = Math.pow(endPrice / startPrice, 1 / yearsActual) - 1;
    const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    const volatility = stdDev * Math.sqrt(252);

    const riskFreeRate = 0.02;
    const sharpe = (cagr - riskFreeRate) / volatility;
    const downside = dailyReturns.filter(r => r < 0);
    const downsideVariance = downside.length > 0 ? downside.reduce((a, b) => a + Math.pow(b, 2), 0) / downside.length : 0;
    const downsideStdDev = Math.sqrt(downsideVariance) * Math.sqrt(252);
    const sortino = (cagr - riskFreeRate) / (downsideStdDev || 1);

    let maxDrawdown = 0;
    let peak = prices[0];
    let drawdowns = [];
    let currentDrawdown = 0;
    let drawdownStart = 0;
    let longestDDDays = 0;

    // New: Track drawdown history
    const drawdownHistory = [];

    for (let i = 0; i < prices.length; i++) {
        const price = prices[i];
        if (price > peak) {
            if (currentDrawdown < 0) {
                const days = (new Date(dates[i]) - new Date(dates[drawdownStart])) / (1000 * 60 * 60 * 24);
                drawdowns.push({ start: drawdownStart, end: i - 1, dd: currentDrawdown, days });
                if (days > longestDDDays) longestDDDays = days;
            }
            peak = price;
            currentDrawdown = 0;
        } else {
            const dd = (price - peak) / peak;
            if (dd < currentDrawdown) {
                if (currentDrawdown === 0) drawdownStart = i;
                currentDrawdown = dd;
            }
            if (dd < maxDrawdown) maxDrawdown = dd;
        }
        drawdownHistory.push({
            date: new Date(dates[i]).toISOString().split('T')[0],
            value: currentDrawdown,
            price: price
        });
    }

    drawdowns.sort((a, b) => a.dd - b.dd);
    const worst5Drawdowns = drawdowns.slice(0, 5);
    const avgDrawdown = drawdowns.reduce((a, b) => a + b.dd, 0) / (drawdowns.length || 1);
    const avgDrawdownDays = drawdowns.reduce((a, b) => a + b.days, 0) / (drawdowns.length || 1);

    const wins = dailyReturns.filter(r => r > 0);
    const losses = dailyReturns.filter(r => r < 0);
    const winRate = wins.length / dailyReturns.length;
    const avgWin = wins.reduce((a, b) => a + b, 0) / (wins.length || 1);
    const avgLoss = Math.abs(losses.reduce((a, b) => a + b, 0) / (losses.length || 1));
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
    const negRetSum = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = negRetSum > 0 ? (wins.reduce((a, b) => a + b, 0)) / negRetSum : 0;

    const cumulativeReturns = prices.map((p, i) => ({
        date: new Date(dates[i]).toISOString().split('T')[0],
        value: (p - startPrice) / startPrice
    }));

    const stats = calculateStats(dailyReturns);
    const periodReturns = calculatePeriodReturns(prices, dates);
    const ulcerIndex = calculateUlcerIndex(prices);
    const calmar = Math.abs(cagr / (maxDrawdown || 1));
    const recoveryFactor = Math.abs(((endPrice - startPrice) / startPrice) / (maxDrawdown || 1));

    const monthlyRets = calculateMonthlyReturnsHelper(data);
    const avgUpMonth = monthlyRets.filter(r => r.return > 0).length > 0 ? monthlyRets.filter(r => r.return > 0).reduce((a, b) => a + b.return, 0) / monthlyRets.filter(r => r.return > 0).length : 0;
    const avgDownMonth = monthlyRets.filter(r => r.return < 0).length > 0 ? monthlyRets.filter(r => r.return < 0).reduce((a, b) => a + b.return, 0) / monthlyRets.filter(r => r.return < 0).length : 0;
    const bestMonth = monthlyRets.length > 0 ? Math.max(...monthlyRets.map(r => r.return)) : 0;
    const worstMonth = monthlyRets.length > 0 ? Math.min(...monthlyRets.map(r => r.return)) : 0;

    let currentWinStreak = 0, maxWinStreak = 0, currentLossStreak = 0, maxLossStreak = 0;
    for (let r of dailyReturns) {
        if (r > 0) { currentWinStreak++; currentLossStreak = 0; if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak; }
        else if (r < 0) { currentLossStreak++; currentWinStreak = 0; if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak; }
        else { currentWinStreak = 0; currentLossStreak = 0; }
    }

    return {
        prices, dailyReturns, dailyReturnsWithDates, drawdownHistory, cagr, volatility, sharpe, sortino, maxDrawdown, longestDDDays, avgDrawdown,
        avgDrawdownDays, winRate, payoffRatio, profitFactor, cumulativeReturns, worst5Drawdowns, avgWin,
        avgLoss, meanReturn, stdDev, ...stats, ...periodReturns, bestDay: Math.max(...dailyReturns),
        worstDay: Math.min(...dailyReturns), expectedDaily: meanReturn, expectedMonthly: Math.pow(1 + meanReturn, 21) - 1,
        expectedYearly: Math.pow(1 + meanReturn, 252) - 1, kelly: winRate - ((1 - winRate) / (payoffRatio || 1)),
        calmar, ulcerIndex, recoveryFactor, avgUpMonth, avgDownMonth, bestMonth, worstMonth,
        winDays: winRate, winMonths: monthlyRets.filter(r => r.return > 0).length / (monthlyRets.length || 1),
        maxConsecutiveGainDays: maxWinStreak, maxConsecutiveLossDays: maxLossStreak, currentPrice: endPrice
    };
};

// --- END METRICS HELPERS ---


exports.getMarketData = async (req, res) => {
    const { symbol } = req.params;
    try {
        const yahooFinance = new YahooFinance();
        const quote = await yahooFinance.quote(symbol);
        res.json(quote);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch market data', details: err.message });
    }
};

exports.recordTrade = (req, res) => {
    // This function records a trade AND the accounting entries
    const { date, symbol, action, quantity, price, fee, currency, exchange_rate, cashAccountId, assetAccountId, broker } = req.body;

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
            INSERT INTO investment_trades (transaction_id, symbol, action, quantity, price, fee, currency, exchange_rate, broker)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmtTrade.run(transactionId, symbol, action, qty, px, fees, currency || 'EUR', fx, broker);

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
    const { date, symbol, action, quantity, price, fee, currency, exchange_rate, cashAccountId, assetAccountId, broker } = req.body;

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
            SET symbol = ?, action = ?, quantity = ?, price = ?, fee = ?, currency = ?, exchange_rate = ?, broker = ?
            WHERE id = ?
        `).run(symbol, action, quantity, price, fee || 0, currency || 'EUR', exchange_rate || 1.0, broker, id);

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

exports.getDashboardSummary = async (req, res) => {
    try {
        const { ticker, year } = req.query;
        let query = `
            SELECT it.*, t.date 
            FROM investment_trades it 
            JOIN transactions t ON it.transaction_id = t.id 
            WHERE 1=1
        `;
        const params = [];

        if (ticker && ticker !== 'ALL') {
            query += ' AND it.symbol = ?';
            params.push(ticker);
        }
        if (year && year !== 'ALL') {
            query += ' AND t.date LIKE ?';
            params.push(`${year}%`);
        }

        query += ' ORDER BY t.date ASC';

        const stmt = db.prepare(query);
        const trades = stmt.all(...params);

        if (trades.length === 0) {
            return res.json({
                summary: { invested: 0, currentValue: 0, pl: 0, plPercent: 0 },
                history: { monthly: [], annual: [] }
            });
        }

        // 2. Fetch History for all symbols
        const uniqueSymbols = [...new Set(trades.map(t => t.symbol))];
        const yahooFinance = new YahooFinance();
        const endDate = new Date();
        const startDate = new Date(trades[0].date); // Start from first trade
        const queryOptions = {
            period1: startDate.toISOString().split('T')[0],
            period2: endDate.toISOString().split('T')[0],
            interval: '1d'
        };

        const priceMap = {}; // { Symbol: { Date: Close } }

        await Promise.all(uniqueSymbols.map(async (sym) => {
            try {
                const res = await yahooFinance.chart(sym, queryOptions);
                if (res && res.quotes) {
                    priceMap[sym] = {};
                    res.quotes.forEach(q => {
                        if (q.date && q.close) {
                            priceMap[sym][new Date(q.date).toISOString().split('T')[0]] = q.close;
                        }
                    });
                    // Fill gaps or use latest price for today?
                    // Let's ensure we have a price for today if possible via quote
                }
            } catch (e) {
                console.error(`Failed to fetch history for ${sym}`, e);
            }
        }));

        // Fetch verification quotes for current price (more accurate than chart)
        const currentPrices = {};
        await Promise.all(uniqueSymbols.map(async (sym) => {
            try {
                const q = await yahooFinance.quote(sym);
                currentPrices[sym] = q.regularMarketPrice;
            } catch (e) {
                // Fallback to last chart price
                const dates = priceMap[sym] ? Object.keys(priceMap[sym]).sort() : [];
                currentPrices[sym] = dates.length > 0 ? priceMap[sym][dates[dates.length - 1]] : 0;
            }
        }));


        // 3. Process Trades day by day to build history
        // We need a daily P&L calculation
        // Strategy: 
        // Iterate every day from Start to End.
        // Maintain:
        // - holdings: { Symbol: Qty }
        // - avgCost: { Symbol: Price } (Weighted Average)
        // - totalRealizedGL: Number
        // - dailyStats: [ { date, invested, value, realizedGL, unrealizedGL, totalPL } ]

        const dailyStats = [];
        const holdings = {}; // Symbol -> Qty
        const avgCosts = {}; // Symbol -> AvgCostPerShare
        let accumulatedRealizedGL = 0;

        // Create date range
        const dates = [];
        let d = new Date(startDate);
        const end = new Date();
        while (d <= end) {
            dates.push(new Date(d).toISOString().split('T')[0]);
            d.setDate(d.getDate() + 1);
        }

        let tradeIdx = 0;

        dates.forEach(dateStr => {
            // Apply trades for this day
            while (tradeIdx < trades.length) {
                const tradeDate = trades[tradeIdx].date;
                if (tradeDate > dateStr) break;

                const t = trades[tradeIdx];
                const sym = t.symbol;
                const qty = parseFloat(t.quantity);
                const price = parseFloat(t.price);
                const fee = parseFloat(t.fee || 0); // Fees are in trade currency. Assuming EUR for simplicity or handled.
                // The DB schema has 'currency' and 'exchange_rate'. 
                // We should convert to EUR.
                const fx = t.exchange_rate || 1;
                const priceEUR = price * fx;
                const feeEUR = fee * fx;

                if (!holdings[sym]) holdings[sym] = 0;
                if (!avgCosts[sym]) avgCosts[sym] = 0;

                if (t.action === 'BUY') {
                    // Update Avg Cost
                    const currentQty = holdings[sym];
                    const currentCost = currentQty * avgCosts[sym];
                    const newCost = currentCost + (qty * priceEUR) + feeEUR; // Add fees to cost basis? User said "añadiendo comisiones". Yes.
                    const newQty = currentQty + qty;
                    avgCosts[sym] = newQty > 0 ? newCost / newQty : 0;
                    holdings[sym] = newQty;
                } else if (t.action === 'SELL') {
                    // Realized GL
                    // Proceeds = (Qty * Price) - Fee
                    // Cost = Qty * AvgCost
                    // GL = Proceeds - Cost
                    const proceeds = (qty * priceEUR) - feeEUR;
                    const cost = qty * avgCosts[sym];
                    const gl = proceeds - cost;
                    accumulatedRealizedGL += gl;
                    holdings[sym] = Math.max(0, holdings[sym] - qty);
                }

                tradeIdx++;
            }

            // Calculate Status for End of Day
            let dailyInvested = 0;
            let dailyValue = 0;

            Object.keys(holdings).forEach(sym => {
                const hQty = holdings[sym];
                if (hQty > 0) {
                    dailyInvested += hQty * avgCosts[sym];

                    // Get Price
                    let p = 0;
                    if (priceMap[sym] && priceMap[sym][dateStr]) {
                        p = priceMap[sym][dateStr]; // Native Chart Price
                    } else {
                        // Find previous price if missing
                        // Simplified: 0 if not found, or use currentPrices if it's today?
                        // Let's look back 5 days
                    }

                    // If no exact date match, look back (gap filling)
                    if (!p && priceMap[sym]) {
                        // Simple lookback
                        const pDates = Object.keys(priceMap[sym]).sort();
                        // Binary search or filter? Filter is slow inside loop.
                        // But we are iterating dates sequentially.
                        // Could optimize, but for now let's just assume we get data or use last known.
                        // Optimization: Keep 'lastKnownPrices' map
                    }
                }
            });
        });

        // 3a. OPTIMIZED LOOP
        // Reset and redo with better structure
        const holdingsMap = {};
        const avgCostMap = {};
        tradeIdx = 0;
        let runningRealizedGL = 0;
        const lastKnownPrices = {}; // Price in EUR? Chart usually in Native. 
        // Need FX history? Assuming FX=1 or constant for now to keep it sane, 
        // OR we just use the priceEUR from the trade for cost, and assume current price is needing FX?
        // Let's assume Native Price * Trade FX for Current Value (Approx)
        // Or fetch EURUSD=X history. This is getting complex.

        // SIMPLIFICATION:
        // User wants "Ganancias". 
        // Let's assume User inputs trades in EUR or we rely on the stored FX in trades?
        // But for *current* value, we need current FX.
        // Let's just use the prices as is, assuming user handles currency mainly in EUR or USD.
        // Actually, db schema has 'currency' and 'exchange_rate'.
        // We should try to normalize to EUR.

        const dailyHistory = [];

        // Pre-fetch FX if needed? For now assume prices are usable.

        tradeIdx = 0;
        dates.forEach(dateStr => {
            // 1. Update Holdings from Trades
            while (tradeIdx < trades.length && trades[tradeIdx].date <= dateStr) {
                const t = trades[tradeIdx];
                const sym = t.symbol;
                const qty = parseFloat(t.quantity);
                const fx = t.exchange_rate || 1;
                const priceEUR = parseFloat(t.price) * fx;
                const feeEUR = parseFloat(t.fee || 0) * fx;

                if (!holdingsMap[sym]) holdingsMap[sym] = 0;
                if (!avgCostMap[sym]) avgCostMap[sym] = 0;

                if (t.action === 'BUY') {
                    const oldCost = holdingsMap[sym] * avgCostMap[sym];
                    const addCost = (qty * priceEUR) + feeEUR;
                    const newQty = holdingsMap[sym] + qty;
                    avgCostMap[sym] = newQty > 0 ? (oldCost + addCost) / newQty : 0;
                    holdingsMap[sym] = newQty;
                } else if (t.action === 'SELL') {
                    // FIFO or AvgCost? Using AvgCost.
                    const costOfSold = qty * avgCostMap[sym];
                    const proceeds = (qty * priceEUR) - feeEUR;
                    runningRealizedGL += (proceeds - costOfSold);
                    holdingsMap[sym] -= qty;
                    if (holdingsMap[sym] < 0) holdingsMap[sym] = 0; // Should not happen
                }
                tradeIdx++;
            }

            // 2. Calculate Daily State
            let totalInvested = 0;
            let totalValue = 0;

            Object.keys(holdingsMap).forEach(sym => {
                const qty = holdingsMap[sym];
                if (qty > 0.0001) {
                    totalInvested += qty * avgCostMap[sym];

                    // Get Price
                    let price = 0;
                    // Try exact date
                    if (priceMap[sym] && priceMap[sym][dateStr]) {
                        price = priceMap[sym][dateStr];
                        lastKnownPrices[sym] = price;
                    } else if (lastKnownPrices[sym]) {
                        price = lastKnownPrices[sym];
                    }

                    // We need FX for Value... Assuming FX 1 for chart loop complexity sake 
                    // or we check the symbol's currency from the last trade?
                    // Let's try to find the currency from the trade list for this symbol
                    const trade = trades.find(t => t.symbol === sym);
                    const fx = trade ? (trade.exchange_rate || 1) : 1;

                    totalValue += qty * price * fx;
                }
            });

            dailyHistory.push({
                date: dateStr,
                invested: totalInvested,
                value: totalValue,
                realized: runningRealizedGL,
                unrealized: totalValue - totalInvested,
                totalPL: (totalValue - totalInvested) + runningRealizedGL
            });
        });

        // 4. Current State (Today)
        const currentStats = dailyHistory[dailyHistory.length - 1] || { invested: 0, value: 0, realized: 0, unrealized: 0, totalPL: 0 };

        // Use Real-Time quotes for the "Headlines" if possible
        // Re-calc current value with `currentPrices`
        let rtValue = 0;
        let rtInvested = 0;
        Object.keys(holdingsMap).forEach(sym => {
            const qty = holdingsMap[sym];
            if (qty > 0.0001) {
                rtInvested += qty * avgCostMap[sym];
                // Find FX
                const trade = trades.find(t => t.symbol === sym);
                const fx = trade ? (trade.exchange_rate || 1) : 1;
                rtValue += qty * (currentPrices[sym] || 0) * fx;
            }
        });

        currentStats.invested = rtInvested;
        currentStats.value = rtValue;
        currentStats.unrealized = rtValue - rtInvested;
        currentStats.totalPL = currentStats.unrealized + runningRealizedGL;


        // 5. Aggregate History (Monthly / Annual)
        const computePeriodStats = (mode) => {
            // mode = 'month' | 'year'
            const groups = {};

            // If a specific year is selected and mode is 'month', we want exactly 12 months
            if (year && year !== 'ALL' && mode === 'month') {
                for (let m = 1; m <= 12; m++) {
                    const key = `${year}-${String(m).padStart(2, '0')}`;
                    groups[key] = { start: null, end: null };
                }
            }

            dailyHistory.forEach((day, idx) => {
                const d = new Date(day.date);
                const key = mode === 'month'
                    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    : `${d.getFullYear()}`;

                if (!groups[key]) {
                    groups[key] = { start: day, end: day };
                } else if (!groups[key].start) {
                    groups[key].start = day;
                }
                groups[key].end = day;
            });

            const results = [];
            const keys = Object.keys(groups).sort();

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];

                // If this is a month with no data (but exists because we force 12 months)
                if (!groups[key].end) {
                    // Find the last known PL before this period
                    let lastKnownPL = 0;
                    for (let j = i - 1; j >= 0; j--) {
                        if (groups[keys[j]].end) {
                            lastKnownPL = groups[keys[j]].end.totalPL;
                            break;
                        }
                    }
                    // If no previous in this set, look at dailyHistory before this year?
                    // For simplicity, if no previous in results, it's 0 or we could fetch the last dailyHist before year.
                    // But if it's forced 12 months, usually we have some history.

                    results.push({
                        period: key,
                        gain: 0,
                        percent: 0,
                        invested: 0
                    });
                    continue;
                }

                const endPL = groups[key].end.totalPL;

                // Find start PL (end of previous period)
                let startPL = 0;
                if (i > 0) {
                    // Find the nearest previous period with data
                    for (let j = i - 1; j >= 0; j--) {
                        if (groups[keys[j]].end) {
                            startPL = groups[keys[j]].end.totalPL;
                            break;
                        }
                    }
                } else {
                    // If first period in selected range, maybe there's historical PL before it?
                    // For now, assume 0 or handle first-period gain as start-to-end
                    startPL = groups[key].start.totalPL - (groups[key].start.totalPL - (groups[key].start.realized + groups[key].start.unrealized)); // This is recursive logic, simpler:
                    // If it's the very first period of all time, startPL is 0.
                    // If we filtered by year 2026, we should find PL at end of 2025.
                    if (year && year !== 'ALL') {
                        const beforeDate = `${year}-01-01`;
                        const lastBefore = dailyHistory.filter(h => h.date < beforeDate).pop();
                        startPL = lastBefore ? lastBefore.totalPL : 0;
                    }
                }

                const gain = endPL - startPL;
                const investedRequest = groups[key].end.invested;
                const percent = investedRequest > 0 ? (gain / investedRequest) * 100 : 0;

                results.push({
                    period: key,
                    gain: gain,
                    percent: percent,
                    invested: investedRequest
                });
            }
            return results;
        };

        const monthlyStats = computePeriodStats('month');
        const annualStats = computePeriodStats('year');

        // 6. Calculate Broker Stats
        const brokerStats = {};
        // Re-iterate trades to build broker-specific holdings
        const brokerHoldings = {}; // { Broker: { Symbol: { qty, avgCost } } }
        const brokerRealizedPL = {}; // { Broker: RealizedPL }

        trades.forEach(t => {
            const broker = t.broker || 'Sin Broker';
            const sym = t.symbol;
            const qty = parseFloat(t.quantity);
            const price = parseFloat(t.price);
            const fee = parseFloat(t.fee || 0);
            const fx = t.exchange_rate || 1;
            const priceEUR = price * fx;
            const feeEUR = fee * fx;

            if (!brokerHoldings[broker]) brokerHoldings[broker] = {};
            if (!brokerHoldings[broker][sym]) brokerHoldings[broker][sym] = { qty: 0, avgCost: 0 };
            if (!brokerRealizedPL[broker]) brokerRealizedPL[broker] = 0;

            if (t.action === 'BUY') {
                const current = brokerHoldings[broker][sym];
                const totalCost = (current.qty * current.avgCost) + (qty * priceEUR) + feeEUR;
                const newQty = current.qty + qty;
                current.avgCost = newQty > 0 ? totalCost / newQty : 0;
                current.qty = newQty;
            } else if (t.action === 'SELL') {
                const current = brokerHoldings[broker][sym];
                const proceeds = (qty * priceEUR) - feeEUR;
                const costSold = qty * current.avgCost;
                brokerRealizedPL[broker] += (proceeds - costSold);
                current.qty = Math.max(0, current.qty - qty);
            }
        });

        // Compute Final Broker Metrics
        const brokerMetrics = {};
        Object.keys(brokerHoldings).forEach(broker => {
            let invested = 0;
            let currentValue = 0;
            const holdings = brokerHoldings[broker];

            Object.keys(holdings).forEach(sym => {
                const h = holdings[sym];
                if (h.qty > 0.0001) {
                    invested += h.qty * h.avgCost;
                    const price = currentPrices[sym] || 0; // Use same current prices as portfolio
                    // Find FX for this symbol? Assuming same as last trade or 1 if not found
                    // Logic for FX is complex but let's re-use the one from portfolio calculation if possible
                    // Or finding the last trade for this symbol in this broker to get FX?
                    // Let's assume standard CurrentPrice is in Native, need FX.
                    const trade = trades.find(t => t.symbol === sym && (t.broker || 'Sin Broker') === broker);
                    const fx = trade ? (trade.exchange_rate || 1) : 1;
                    currentValue += h.qty * price * fx;
                }
            });

            const realized = brokerRealizedPL[broker] || 0;
            const unrealized = currentValue - invested;
            const totalPL = realized + unrealized;
            const plPercent = invested > 0 ? (totalPL / invested) * 100 : 0;

            brokerMetrics[broker] = {
                invested,
                currentValue,
                pl: totalPL,
                plPercent
            };
        });

        res.json({
            summary: {
                invested: currentStats.invested,
                currentValue: currentStats.value,
                pl: currentStats.totalPL,
                plPercent: currentStats.invested > 0 ? (currentStats.totalPL / currentStats.invested) * 100 : 0
            },
            history: {
                monthly: monthlyStats,
                annual: annualStats
            },
            brokers: brokerMetrics
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTrade = (req, res) => {
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
            SET symbol = ?, action = ?, quantity = ?, price = ?, fee = ?, currency = ?, exchange_rate = ?, broker = ?
            WHERE id = ?
        `).run(symbol, action, quantity, price, fee || 0, currency || 'EUR', exchange_rate || 1.0, req.body.broker || '', id);

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

        // Note: Managing fees separately in accounting is better, but for now we bundle or subtract/add

        // Re-insert entries
        const stmtEntry = db.prepare('INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, ?)');

        if (action === 'BUY') {
            // Asset increases by Cost Basis (Price * Qty * FX) + Fees? Usually fees are added to cost basis.
            // Let's assume Price * Qty * FX is the main amount.
            const costBasis = totalAmountEUR + feesEUR;

            // Debit Asset (Increase), Credit Cash (Decrease)
            stmtEntry.run(transactionId, assetAccountId, costBasis, 0);
            stmtEntry.run(transactionId, cashAccountId, 0, costBasis);
        } else if (action === 'SELL') {
            // Credit Asset, Debit Cash.
            // In a perfect world we know the original cost basis to split between Cost and Gain.
            // MVP: Cash increases by (Price * Qty * FX) - Fees
            const proceeds = totalAmountEUR - feesEUR;

            stmtEntry.run(transactionId, cashAccountId, proceeds, 0);
            stmtEntry.run(transactionId, assetAccountId, 0, totalAmountEUR); // This might leave residual in asset account if price changed. 
            // Ideally we need to balance to a 'Realized Gain/Loss' account.
            // For now, let's just make it balance: Cash = Asset (Proceeds) 
            // But if we credit Asset with current value, we are reducing it by current value. 
            // Let's stick to the previous simple logic: 
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
        if (!existing) return; // Already gone or not found

        // Cascading delete should handle the rest if configured, but let's be explicit
        // Deleting transaction deletes investment_trades (Cascade) and journal_entries (Cascade) defined in schema?
        // Schema says:
        // investment_trades -> FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
        // journal_entries -> FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE

        // So deleting the transaction should satisfy everything.
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

exports.analyzeTicker = async (req, res) => {
    console.log(`[DEBUG] analyzeTicker called for ${req.params.ticker} with query:`, req.query);
    try {
        const { ticker } = req.params;
        const { benchmark = 'SPY', years = 5, startDate: reqStartDate, endDate: reqEndDate, currency = 'USD', benchmarkCurrency = 'USD', accountId } = req.query;

        console.log(`Analyzing: ${ticker} (${currency}) vs ${benchmark} (${benchmarkCurrency}). Years: ${years}. Account: ${accountId || 'All'}`);

        const yahooFinance = new YahooFinance();

        // 1. DETERMINE DATE RANGE
        let period1, period2;
        if (reqStartDate && reqEndDate) {
            period1 = reqStartDate;
            period2 = reqEndDate;
        } else {
            const end = new Date();
            const start = new Date();
            start.setFullYear(end.getFullYear() - parseInt(years));
            period1 = start.toISOString().split('T')[0];
            period2 = end.toISOString().split('T')[0];
        }
        const queryOptions = { period1, period2, interval: '1d' };

        // 2. FETCH DATA PROMISES
        const promises = [];
        const keys = [];

        // Strategy Data
        const isReconstruction = ticker === 'PORTFOLIO' || ticker !== benchmark;

        if (!isReconstruction && ticker) {
            promises.push(yahooFinance.chart(ticker, queryOptions).catch(e => null));
            keys.push('strategy');
        }

        // Benchmark Data
        if (benchmark) {
            promises.push(yahooFinance.chart(benchmark, queryOptions).catch(e => null));
            keys.push('benchmark');
        }

        // Currency Data (if needed for EITHER)
        let currencyData = null;
        if (currency === 'EUR' || benchmarkCurrency === 'EUR') {
            promises.push(yahooFinance.chart('EURUSD=X', queryOptions).catch(e => null));
            keys.push('currency');
        }

        // EXECUTE FETCHES
        const results = await Promise.all(promises);
        const dataMap = {};
        keys.forEach((key, idx) => {
            dataMap[key] = results[idx]?.quotes || [];
        });

        // HANDLE RECONSTRUCTION (PORTFOLIO OR SPECIFIC TICKER)
        if (isReconstruction) {
            console.log(`Reconstructing History for ${ticker}...`);
            // 1. Get trades
            let stmt;
            const queryParts = [
                "SELECT t.date, it.symbol, it.action, it.quantity, it.price",
                "FROM investment_trades it",
                "JOIN transactions t ON it.transaction_id = t.id"
            ];
            const params = [];

            const whereClause = [];
            if (accountId) {
                whereClause.push("t.id IN (SELECT transaction_id FROM journal_entries WHERE account_id = ?)");
                params.push(accountId);
            }
            if (ticker !== 'PORTFOLIO') {
                whereClause.push("it.symbol = ?");
                params.push(ticker);
            }

            if (whereClause.length > 0) {
                queryParts.push("WHERE " + whereClause.join(" AND "));
            }
            queryParts.push("ORDER BY t.date ASC");

            stmt = db.prepare(queryParts.join("\n"));
            const trades = stmt.all(...params);

            if (trades.length === 0) {
                if (ticker === 'PORTFOLIO') {
                    return res.status(200).json({
                        error: "No se encontraron operaciones en el portfolio. Registra algunas operaciones para ver el análisis.",
                        isEmpty: true
                    });
                } else {
                    // Fallback to market data if no trades found for this specific ticker
                    const resMarket = await yahooFinance.chart(ticker, queryOptions).catch(e => null);
                    dataMap['strategy'] = resMarket?.quotes || [];
                }
            }

            if (trades.length > 0) {

                // 2. Identify unique symbols and fetch their history
                const uniqueSymbols = [...new Set(trades.map(t => t.symbol))];
                const symbolData = {};

                await Promise.all(uniqueSymbols.map(async (sym) => {
                    try {
                        const res = await yahooFinance.chart(sym, queryOptions);
                        if (res && res.quotes) {
                            const priceMap = {};
                            res.quotes.forEach(q => {
                                if (q.date) priceMap[new Date(q.date).toISOString().split('T')[0]] = q.close;
                            });
                            symbolData[sym] = priceMap;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch history for portfolio symbol ${sym}:`, err.message);
                    }
                }));

                // 3. Reconstruct Daily Value
                let portfolioQuotes = [];
                let holdings = {};
                let tradeIdx = 0;

                const referenceDates = dataMap['benchmark'].length > 0
                    ? dataMap['benchmark'].map(q => new Date(q.date))
                    : (() => {
                        const dates = [];
                        let d = new Date(period1);
                        const end = new Date(period2);
                        while (d <= end) {
                            dates.push(new Date(d));
                            d.setDate(d.getDate() + 1);
                        }
                        return dates;
                    })();

                const applyTrade = (h, trade) => {
                    if (!h[trade.symbol]) h[trade.symbol] = 0;
                    if (trade.action === 'BUY') h[trade.symbol] += trade.quantity;
                    if (trade.action === 'SELL') h[trade.symbol] -= trade.quantity;
                };

                referenceDates.forEach(currentDate => {
                    const dateStr = currentDate.toISOString().split('T')[0];

                    const lastPrices = {}; // Keep track of last known prices

                    // Initialize lastPrices with first available price or 0
                    Object.keys(symbolData).forEach(sym => {
                        const dates = Object.keys(symbolData[sym]).sort();
                        if (dates.length > 0) lastPrices[sym] = symbolData[sym][dates[0]];
                        else lastPrices[sym] = 0;
                    });

                    while (tradeIdx < trades.length && new Date(trades[tradeIdx].date) <= currentDate) {
                        applyTrade(holdings, trades[tradeIdx]);
                        // Update last price if we have trade info? No, trade price is not necessarily market price.
                        tradeIdx++;
                    }

                    let nav = 0;
                    Object.keys(holdings).forEach(sym => {
                        const qty = holdings[sym];
                        if (qty !== 0) {
                            let price = 0;
                            if (symbolData[sym] && symbolData[sym][dateStr]) {
                                price = symbolData[sym][dateStr];
                                lastPrices[sym] = price; // Update last known
                            } else {
                                price = lastPrices[sym] || 0; // Forward fill
                            }
                            nav += qty * price;
                        }
                    });

                    portfolioQuotes.push({
                        date: currentDate,
                        close: nav,
                        open: nav, high: nav, low: nav, volume: 0
                    });
                });

                portfolioQuotes = portfolioQuotes.filter(d => d.close > 0);
                dataMap['strategy'] = portfolioQuotes;
            }
        } else if (ticker) {
            // Market data fallback for benchmark or raw ticker view
            const resMarket = await yahooFinance.chart(ticker, queryOptions).catch(e => null);
            dataMap['strategy'] = resMarket?.quotes || [];
        }

        // 3. ALIGNMENT & CONVERSION LOGIC
        const dateMaps = {};
        const allDates = new Set();

        Object.keys(dataMap).forEach(key => {
            const series = dataMap[key];
            if (series.length > 0) {
                dateMaps[key] = {};
                series.forEach(q => {
                    const d = new Date(q.date).toISOString().split('T')[0];
                    dateMaps[key][d] = q;
                    allDates.add(d);
                });
            }
        });

        const sortedDates = Array.from(allDates).sort();

        const requiredKeys = [];
        if (ticker && dateMaps['strategy'] && Object.keys(dateMaps['strategy']).length > 0) requiredKeys.push('strategy');
        if (benchmark && dateMaps['benchmark'] && Object.keys(dateMaps['benchmark']).length > 0) requiredKeys.push('benchmark');
        // Require currency if EITHER needs it
        if ((currency === 'EUR' || benchmarkCurrency === 'EUR') && dateMaps['currency']) requiredKeys.push('currency');

        console.log(`[DEBUG] Alignment Keys: ${requiredKeys.join(', ')}. Total Dates: ${sortedDates.length}`);

        const alignedData = [];

        sortedDates.forEach(date => {
            const entry = { date };
            let isValid = true;

            for (const key of requiredKeys) {
                if (!dateMaps[key] || !dateMaps[key][date]) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                if (dateMaps['strategy']) entry.strategy = { ...dateMaps['strategy'][date] }; // Clone to avoid mutation issues
                if (dateMaps['benchmark']) entry.benchmark = { ...dateMaps['benchmark'][date] };

                // Get Currency Rate (1 EUR = rate USD)
                const cur = dateMaps['currency'] ? dateMaps['currency'][date] : null;
                const rate = cur ? cur.close : 1;

                // Convert Strategy if EUR
                if (currency === 'EUR' && rate && entry.strategy) {
                    entry.strategy.close /= rate;
                    entry.strategy.open /= rate;
                    entry.strategy.high /= rate;
                    entry.strategy.low /= rate;
                }

                // Convert Benchmark if EUR (INDEPENDENT CHECK)
                if (benchmarkCurrency === 'EUR' && rate && entry.benchmark) {
                    entry.benchmark.close /= rate;
                    entry.benchmark.open /= rate;
                    entry.benchmark.high /= rate;
                    entry.benchmark.low /= rate;
                }

                alignedData.push(entry);
            }
        });

        // Reconstruct arrays for the rest of the code
        const strategyData = alignedData.map(d => d.strategy).filter(x => x);
        const benchmarkData = alignedData.map(d => d.benchmark).filter(x => x);

        if (strategyData.length < 2) {
            return res.status(404).json({ error: 'No data found for the requested ticker.' });
        }



        const strategy = calculateMetrics(strategyData, ticker);
        const bench = calculateMetrics(benchmarkData, benchmark);

        // Comparative Metrics (requiring both arrays)
        const stratRets = strategy.dailyReturns;
        const benchRets = bench.dailyReturns;
        const minLen = Math.min(stratRets.length, benchRets.length);

        // R-Squared, Beta, Alpha
        const sliceStrat = stratRets.slice(stratRets.length - minLen);
        const sliceBench = benchRets.slice(benchRets.length - minLen);

        const rSquaredVal = calculateRSquared(sliceStrat, sliceBench);
        // Add to objects
        strategy.rSquared = rSquaredVal;
        bench.rSquared = 1.0;

        // Calculate Beta and Alpha
        const stratMean = sliceStrat.reduce((a, b) => a + b, 0) / sliceStrat.length;
        const benchMean = sliceBench.reduce((a, b) => a + b, 0) / sliceBench.length;

        let covariance = 0;
        let benchVariance = 0;
        for (let i = 0; i < sliceStrat.length; i++) {
            covariance += (sliceStrat[i] - stratMean) * (sliceBench[i] - benchMean);
            benchVariance += Math.pow(sliceBench[i] - benchMean, 2);
        }
        covariance /= sliceStrat.length;
        benchVariance /= sliceBench.length;

        const beta = benchVariance !== 0 ? covariance / benchVariance : 0;
        const alpha = (strategy.cagr - (0.02 + beta * (bench.cagr - 0.02))); // Assuming 2% risk-free rate

        strategy.beta = beta;
        strategy.alpha = alpha;
        bench.beta = 1.0;
        bench.alpha = 0;


        const metricsCompare = [
            { metric: "Current Price", strategy: n(strategy.currentPrice), benchmark: n(bench.currentPrice) },
            { metric: "Risk-Free Rate", strategy: "2.0%", benchmark: "2.0%" },
            { metric: "Time in Market", strategy: "100.0%", benchmark: "100.0%" },
            { isHeader: true },
            { metric: "Cumulative Return", strategy: p(strategy.cumulativeReturns[strategy.cumulativeReturns.length - 1].value), benchmark: p(bench.cumulativeReturns[bench.cumulativeReturns.length - 1].value) },
            { metric: "CAGR%", strategy: p(strategy.cagr), benchmark: p(bench.cagr) },
            { isHeader: true },
            { metric: "Sharpe", strategy: n(strategy.sharpe), benchmark: n(bench.sharpe) },
            { metric: "Sortino", strategy: n(strategy.sortino), benchmark: n(bench.sortino) },
            { metric: "Sortino/√2", strategy: n(strategy.sortino / Math.sqrt(2)), benchmark: n(bench.sortino / Math.sqrt(2)) },
            { isHeader: true },
            { metric: "Max Drawdown", strategy: p(strategy.maxDrawdown), benchmark: p(bench.maxDrawdown) },
            { metric: "Longest DD Days", strategy: strategy.longestDDDays.toFixed(0), benchmark: bench.longestDDDays.toFixed(0) },
            { metric: "Volatility (ann.)", strategy: p(strategy.volatility), benchmark: p(bench.volatility) },
            { metric: "R^2", strategy: n(strategy.rSquared), benchmark: n(bench.rSquared) },
            { metric: "Calmar", strategy: n(strategy.calmar), benchmark: n(bench.calmar) },
            { metric: "Skew", strategy: n(strategy.skew), benchmark: n(bench.skew) },
            { metric: "Kurtosis", strategy: n(strategy.kurtosis), benchmark: n(bench.kurtosis) },
            { isHeader: true },
            { metric: "Expected Daily %", strategy: p(strategy.expectedDaily), benchmark: p(bench.expectedDaily) },
            { metric: "Expected Monthly %", strategy: p(strategy.expectedMonthly), benchmark: p(bench.expectedMonthly) },
            { metric: "Expected Yearly %", strategy: p(strategy.expectedYearly), benchmark: p(bench.expectedYearly) },
            { metric: "Kelly Criterion", strategy: p(strategy.kelly), benchmark: p(bench.kelly) },
            { metric: "Risk of Ruin", strategy: p(strategy.riskOfRuin || 0), benchmark: p(bench.riskOfRuin || 0) },
            { metric: "Daily Value-at-Risk", strategy: p(strategy.vaR), benchmark: p(bench.vaR) },
            { metric: "Expected Shortfall (cVaR)", strategy: p(strategy.cVaR), benchmark: p(bench.cVaR) },
            { isHeader: true },
            { metric: "Gain/Pain Ratio", strategy: n(strategy.gainPain), benchmark: n(bench.gainPain) },
            { metric: "Payoff Ratio", strategy: n(strategy.payoffRatio), benchmark: n(bench.payoffRatio) },
            { metric: "Profit Factor", strategy: n(strategy.profitFactor), benchmark: n(bench.profitFactor) },
            { metric: "Common Sense Ratio", strategy: n((strategy.profitFactor * strategy.tailRatio)), benchmark: n((bench.profitFactor * bench.tailRatio)) },
            { metric: "CPC Index", strategy: n(strategy.cpcIndex || 0), benchmark: n(bench.cpcIndex || 0) },
            { metric: "Tail Ratio", strategy: n(strategy.tailRatio), benchmark: n(bench.tailRatio) },
            { metric: "Outlier Win Ratio", strategy: n(strategy.outlierWinRatio || 0), benchmark: n(bench.outlierWinRatio || 0) },
            { metric: "Outlier Loss Ratio", strategy: n(strategy.outlierLossRatio || 0), benchmark: n(bench.outlierLossRatio || 0) },
            { isHeader: true },
            { metric: "MTD", strategy: p(strategy.mtd), benchmark: p(bench.mtd) },
            { metric: "3M", strategy: p(strategy.r3m), benchmark: p(bench.r3m) },
            { metric: "6M", strategy: p(strategy.r6m), benchmark: p(bench.r6m) },
            { metric: "YTD", strategy: p(strategy.ytd), benchmark: p(bench.ytd) },
            { metric: "1Y", strategy: p(strategy.r1y), benchmark: p(bench.r1y) },
            { metric: "3Y (ann.)", strategy: p(strategy.r3y), benchmark: p(bench.r3y) },
            { metric: "5Y (ann.)", strategy: p(strategy.r5y), benchmark: p(bench.r5y) },
            { metric: "All-time (ann.)", strategy: p(strategy.cagr), benchmark: p(bench.cagr) },
            { isHeader: true },
            { metric: "Best Day", strategy: p(strategy.bestDay), benchmark: p(bench.bestDay) },
            { metric: "Worst Day", strategy: p(strategy.worstDay), benchmark: p(bench.worstDay) },
            { metric: "Best Month", strategy: p(strategy.bestMonth || 0), benchmark: p(bench.bestMonth || 0) },
            { metric: "Worst Month", strategy: p(strategy.worstMonth || 0), benchmark: p(bench.worstMonth || 0) },
            { isHeader: true },
            { metric: "Avg. Drawdown", strategy: p(strategy.avgDrawdown), benchmark: p(bench.avgDrawdown) },
            { metric: "Avg. Drawdown Days", strategy: strategy.avgDrawdownDays.toFixed(0), benchmark: bench.avgDrawdownDays.toFixed(0) },
            { metric: "Recovery Factor", strategy: n(strategy.recoveryFactor || 0), benchmark: n(bench.recoveryFactor || 0) },
            { metric: "Ulcer Index", strategy: n(strategy.ulcerIndex || 0), benchmark: n(bench.ulcerIndex || 0) },
            { isHeader: true },
            { metric: "Avg. Up Month", strategy: p(strategy.avgUpMonth || 0), benchmark: p(bench.avgUpMonth || 0) },
            { metric: "Avg. Down Month", strategy: p(strategy.avgDownMonth || 0), benchmark: p(bench.avgDownMonth || 0) },
            { isHeader: true },
            { metric: "Win Days %", strategy: p(strategy.winDays || 0), benchmark: p(bench.winDays || 0) },
            { metric: "Win Month %", strategy: p(strategy.winMonths || 0), benchmark: p(bench.winMonths || 0) },
            { metric: "Win Quarter %", strategy: p(strategy.winQuarters || 0), benchmark: p(bench.winQuarters || 0) },
            { metric: "Win Year %", strategy: p(strategy.winYears || 0), benchmark: p(bench.winYears || 0) },
            { metric: "Max Consec. Gain Days", strategy: strategy.maxConsecutiveGainDays.toFixed(0), benchmark: bench.maxConsecutiveGainDays.toFixed(0) },
            { metric: "Max Consec. Loss Days", strategy: strategy.maxConsecutiveLossDays.toFixed(0), benchmark: bench.maxConsecutiveLossDays.toFixed(0) },
            { metric: "Beta", strategy: n(strategy.beta || 0), benchmark: "-" },
            { metric: "Alpha", strategy: p(strategy.alpha || 0), benchmark: "-" }
        ];

        // ----------------------------------------------------
        // RESTORED MISSING CALCULATIONS FOR EOY & MONTHLY DATA
        // ----------------------------------------------------


        const monthlyReturns = calculateMonthlyReturnsHelper(strategyData);
        const benchmarkMonthlyReturns = calculateMonthlyReturnsHelper(benchmarkData);

        // Yearly returns (EOY)
        const yearlyMap = {};
        strategyData.forEach(r => {
            const year = new Date(r.date).getFullYear();
            if (!yearlyMap[year]) yearlyMap[year] = { start: r.close, end: r.close };
            yearlyMap[year].end = r.close;
        });

        // Benchmark Yearly Map for comparison
        const benchYearlyMap = {};
        benchmarkData.forEach(r => {
            const year = new Date(r.date).getFullYear();
            if (!benchYearlyMap[year]) benchYearlyMap[year] = { start: r.close, end: r.close };
            benchYearlyMap[year].end = r.close;
        });

        const eoyReturns = Object.keys(yearlyMap).sort().map(y => {
            const yData = yearlyMap[y];
            const stratRet = (yData.end - yData.start) / yData.start;

            const bData = benchYearlyMap[y];
            const benchRet = bData ? (bData.end - bData.start) / bData.start : 0;

            const multiplier = benchRet !== 0 ? stratRet / benchRet : 0;

            return {
                year: parseInt(y),
                benchmark: (benchRet * 100).toFixed(2) + "%",
                strategy: (stratRet * 100).toFixed(2) + "%",
                multiplier: multiplier.toFixed(2),
                won: stratRet > benchRet ? "+" : "-"
            };
        });
        // ----------------------------------------------------

        // Calculate rolling metrics
        const rollingWindow6m = 126; // ~6 months
        const rollingWindow12m = 252; // ~12 months
        const rollingMetrics = [];


        for (let i = rollingWindow6m; i < strategyData.length; i++) {
            const windowStrategyPrices6m = strategy.prices.slice(i - rollingWindow6m, i);
            const windowBenchPrices6m = bench.prices.slice(i - rollingWindow6m, i);

            // Calculate returns for 6m window (for Vol, Sharpe, Sortino)
            const stratReturns6m = [];
            const benchReturns6m = [];
            for (let j = 1; j < windowStrategyPrices6m.length; j++) {
                stratReturns6m.push((windowStrategyPrices6m[j] - windowStrategyPrices6m[j - 1]) / windowStrategyPrices6m[j - 1]);
                benchReturns6m.push((windowBenchPrices6m[j] - windowBenchPrices6m[j - 1]) / windowBenchPrices6m[j - 1]);
            }

            const stratMean6m = stratReturns6m.reduce((a, b) => a + b, 0) / stratReturns6m.length;
            const benchMean6m = benchReturns6m.reduce((a, b) => a + b, 0) / benchReturns6m.length;

            // Beta 6m
            const beta6m = calculateBetaHelper(windowStrategyPrices6m, windowBenchPrices6m);

            // Beta 12m (if enough data)
            let beta12m = null;
            if (i >= rollingWindow12m) {
                const windowStrategyPrices12m = strategy.prices.slice(i - rollingWindow12m, i);
                const windowBenchPrices12m = bench.prices.slice(i - rollingWindow12m, i);
                beta12m = calculateBetaHelper(windowStrategyPrices12m, windowBenchPrices12m);
            }

            // Volatility 6m
            const variance6m = stratReturns6m.reduce((a, b) => a + Math.pow(b - stratMean6m, 2), 0) / stratReturns6m.length;
            const volatility6m = Math.sqrt(variance6m) * Math.sqrt(252);

            // Benchmark Volatility 6m
            const benchVariance6m = benchReturns6m.reduce((a, b) => a + Math.pow(b - benchMean6m, 2), 0) / benchReturns6m.length;
            const benchVolatility6m = Math.sqrt(benchVariance6m) * Math.sqrt(252);

            // Sharpe 6m
            const windowCagr6m = Math.pow(windowStrategyPrices6m[windowStrategyPrices6m.length - 1] / windowStrategyPrices6m[0], 252 / (rollingWindow6m - 1)) - 1;
            const sharpe6m = (windowCagr6m - 0.02) / volatility6m;

            // Sortino 6m
            const downside6m = stratReturns6m.filter(r => r < 0);
            const downsideVar6m = downside6m.reduce((a, b) => a + Math.pow(b, 2), 0) / (downside6m.length || 1);
            const downsideStd6m = Math.sqrt(downsideVar6m) * Math.sqrt(252);
            const sortino6m = (windowCagr6m - 0.02) / downsideStd6m;

            rollingMetrics.push({
                date: new Date(strategyData[i].date).toISOString().split('T')[0],
                beta: beta6m,
                beta12m: beta12m,
                volatility: volatility6m,
                benchVolatility: benchVolatility6m,
                sharpe: sharpe6m,
                sortino: sortino6m
            });
        }


        const worstDrawdowns = calculateWorstDrawdowns(strategyData);

        res.json({
            metrics: metricsCompare,
            eoyReturns,
            monthlyReturns,
            benchmarkMonthlyReturns,
            cumulativeReturns: strategy.cumulativeReturns,
            benchmarkCumulativeReturns: bench.cumulativeReturns,
            dailyReturns: strategy.dailyReturnsWithDates,
            drawdownHistory: strategy.drawdownHistory,
            strategyPrices: strategy.prices,
            benchmarkPrices: bench.prices,
            worstDrawdowns: worstDrawdowns,
            rollingMetrics: rollingMetrics,
            strategyHistory: strategyData // Expose raw history with dates
        });

    } catch (err) {
        console.error(err);

        // Log error to file for debugging
        const logPath = path.join(__dirname, '..', 'server_error.log');
        const logContent = `\n[${new Date().toISOString()}] Error analysing ${req.params.ticker}:\n${err.message}\n${err.stack}\n${JSON.stringify(err)}\n-------------------\n`;
        try {
            fs.appendFileSync(logPath, logContent);
        } catch (fileErr) {
            console.error('Failed to write to log file:', fileErr);
        }

        res.status(500).json({ error: err.message || 'Analysis failed', details: err.toString() });
    }
};

exports.optimizePortfolio = async (req, res) => {
    try {
        const { tickers, years = 5 } = req.body;

        if (!tickers || !Array.isArray(tickers) || tickers.length < 2) {
            return res.status(400).json({ error: "Please provide at least 2 tickers." });
        }

        console.log(`Optimizing portfolio for: ${tickers.join(', ')} over ${years} years`);

        const yahooFinance = new YahooFinance();
        const end = new Date();
        const start = new Date();
        start.setFullYear(end.getFullYear() - parseInt(years));
        const period1 = start.toISOString().split('T')[0];
        const period2 = end.toISOString().split('T')[0];

        const historyPromises = tickers.map(async t => {
            try {
                return await yahooFinance.historical(t, { period1, period2, interval: '1d' });
            } catch (e) {
                console.error(`Failed to fetch data for ${t}:`, e.message);
                // Also log to file if needed or throw specific error
                throw new Error(`Failed to fetch data for ${t}: ${e.message}`);
            }
        });
        const historyResults = await Promise.all(historyPromises);

        const priceMap = {};
        const validDates = new Set();

        historyResults.forEach((hist, i) => {
            const sym = tickers[i];
            hist.forEach(day => {
                const dateStr = day.date.toISOString().split('T')[0];
                if (!priceMap[dateStr]) priceMap[dateStr] = {};
                priceMap[dateStr][sym] = day.adjClose;
                validDates.add(dateStr);
            });
        });

        const sortedDates = Array.from(validDates).sort();
        const commonDates = sortedDates.filter(d => Object.keys(priceMap[d]).length === tickers.length);

        if (commonDates.length < 30) {
            return res.status(400).json({ error: "Not enough overlapping data for these tickers." });
        }

        const returns = [];

        for (let i = 1; i < commonDates.length; i++) {
            const today = commonDates[i];
            const prev = commonDates[i - 1];
            const row = [];

            tickers.forEach(sym => {
                const p0 = priceMap[prev][sym];
                const p1 = priceMap[today][sym];
                const r = (p1 - p0) / p0;
                row.push(r);
            });
            returns.push(row);
        }

        const numPortfolios = 10000; // Increased for better coverage
        const results = [];
        const riskFreeRate = 0.04;

        const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        const std = (arr, m) => Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);

        // Deterministic Seeded RNG (Mulberry32)
        // Ensures the same "random" weights are generated every time for the same params
        let seed = 123456789; // Fixed seed
        const random = () => {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };

        for (let i = 0; i < numPortfolios; i++) {
            let weights = tickers.map(() => random());
            const sumW = weights.reduce((a, b) => a + b, 0);
            weights = weights.map(w => w / sumW);

            const portDailyReturns = returns.map(row => {
                return row.reduce((sum, r, idx) => sum + (r * weights[idx]), 0);
            });

            // Calculate Max Drawdown for the portfolio
            let peak = 1;
            let currentPrice = 1;
            let portMaxDD = 0;
            portDailyReturns.forEach(r => {
                currentPrice *= (1 + r);
                if (currentPrice > peak) peak = currentPrice;
                const dd = (currentPrice - peak) / peak;
                if (dd < portMaxDD) portMaxDD = dd;
            });

            const portMeanDaily = mean(portDailyReturns);
            const portStdDaily = std(portDailyReturns, portMeanDaily);

            const annualizedReturn = portMeanDaily * 252;
            const annualizedVol = portStdDaily * Math.sqrt(252);
            const sharpe = (annualizedReturn - riskFreeRate) / annualizedVol;

            results.push({
                return: annualizedReturn,
                volatility: annualizedVol,
                maxDrawdown: portMaxDD,
                sharpe: sharpe,
                weights: weights
            });
        }

        // Identify optimal points from simulated results
        const bestPort = results.reduce((p, c) => (c.sharpe > p.sharpe ? c : p));
        const minVolPort = results.reduce((p, c) => (c.volatility < p.volatility ? c : p));
        const minDDPort = results.reduce((p, c) => (Math.abs(c.maxDrawdown) < Math.abs(p.maxDrawdown) ? c : p));

        // Max Return / Max Drawdown ratio (Calmar-like Optimization)
        const maxCalmarPort = results.reduce((p, c) => {
            const rP = p.return / (Math.abs(p.maxDrawdown) || 0.001);
            const rC = c.return / (Math.abs(c.maxDrawdown) || 0.001);
            return rC > rP ? c : p;
        });

        const response = {
            tickers,
            points: results,
            bestPortfolio: { ...bestPort, weights: Object.fromEntries(tickers.map((t, i) => [t, bestPort.weights[i]])) },
            minVolPortfolio: { ...minVolPort, weights: Object.fromEntries(tickers.map((t, i) => [t, minVolPort.weights[i]])) },
            minDrawdownPortfolio: { ...minDDPort, weights: Object.fromEntries(tickers.map((t, i) => [t, minDDPort.weights[i]])) },
            maxCalmarPortfolio: { ...maxCalmarPort, weights: Object.fromEntries(tickers.map((t, i) => [t, maxCalmarPort.weights[i]])) }
        };

        res.json(response);

    } catch (err) {
        console.error("Optimization Error", err);
        try {
            const logPath = path.join(__dirname, '../server_error.log');
            const logContent = `\n[${new Date().toISOString()}] Optimization Error:\n${err.stack || err}\n-------------------\n`;
            fs.appendFileSync(logPath, logContent);
        } catch (e) {
            console.error('Failed to log error:', e);
        }
        res.status(500).json({ error: err.message });
    }
};

exports.analyzeCustomPortfolio = async (req, res) => {
    try {
        const { weights, benchmark = 'SPY', years = 5 } = req.body;

        const tickers = Object.keys(weights);
        if (tickers.length === 0) return res.status(400).json({ error: "No weights provided" });

        const yahooFinance = new YahooFinance();
        const end = new Date();
        const start = new Date();
        start.setFullYear(end.getFullYear() - parseInt(years));
        const period1 = start.toISOString().split('T')[0];
        const period2 = end.toISOString().split('T')[0];
        const queryOptions = { period1, period2, interval: '1d' };

        console.log(`Analyzing Custom Portfolio: ${tickers.join(', ')}`);

        // Fetch History
        const promises = tickers.map(t => yahooFinance.historical(t, queryOptions).catch(e => []));
        if (benchmark) promises.push(yahooFinance.historical(benchmark, queryOptions).catch(e => []));

        const results = await Promise.all(promises);
        const benchResult = benchmark ? results.pop() : [];
        const tickerResults = results;

        // Align Data
        const priceMap = {};
        const validDates = new Set();
        const benchMap = {};

        // Bench Map
        benchResult.forEach(q => {
            const d = q.date.toISOString().split('T')[0];
            benchMap[d] = q.adjClose;
        });

        // Tickers Map
        tickerResults.forEach((hist, i) => {
            const sym = tickers[i];
            hist.forEach(day => {
                const d = day.date.toISOString().split('T')[0];
                if (!priceMap[d]) priceMap[d] = {};
                priceMap[d][sym] = day.adjClose;
                validDates.add(d);
            });
        });

        const sortedDates = Array.from(validDates).sort();
        // Common dates where we have prices for ALL weighted tickers
        // (Benchmark optional, can be filled/ignored if missing)
        const commonDates = sortedDates.filter(d => {
            const manualCheck = tickers.every(t => priceMap[d] && priceMap[d][t] !== undefined);
            return manualCheck;
        });

        if (commonDates.length < 2) return res.status(400).json({ error: "Not enough overlapping data" });

        // Construct Series
        // We simulate a daily rebalanced portfolio or simply Sum(W * Return)
        // Standard for these "constant weight" portfolios is Sum(W * Return)

        const strategyPrices = [10000]; // Start at 10k
        const benchmarkPrices = [10000]; // Start at 10k (normalized)

        // Find initial bench price
        let initialBench = 0;
        // Search for first aligned date with benchmark
        const startIdx = commonDates.findIndex(d => benchMap[d]);
        if (startIdx !== -1) initialBench = benchMap[commonDates[startIdx]];

        for (let i = 1; i < commonDates.length; i++) {
            const today = commonDates[i];
            const prev = commonDates[i - 1];

            // Portfolio Return
            let dailyRet = 0;
            tickers.forEach(sym => {
                const p0 = priceMap[prev][sym];
                const p1 = priceMap[today][sym];
                const r = (p1 - p0) / p0;
                dailyRet += r * weights[sym];
            });

            const prevNav = strategyPrices[strategyPrices.length - 1];
            strategyPrices.push(prevNav * (1 + dailyRet));

            // Benchmark Prices (Just strictly map or align)
            // If benchmark exists for today
            if (initialBench) {
                if (benchMap[today]) {
                    // Normalized to 10000
                    const bVal = (benchMap[today] / initialBench) * 10000;
                    benchmarkPrices.push(bVal);
                } else {
                    // Carry forward or null? Use prev
                    benchmarkPrices.push(benchmarkPrices[benchmarkPrices.length - 1]);
                }
            } else {
                benchmarkPrices.push(10000);
            }
        }

        // Return full structure for Frontend
        const strategyData = commonDates.map((d, i) => ({ date: d, close: strategyPrices[i] }));
        const benchmarkData = commonDates.map((d, i) => ({ date: d, close: benchmarkPrices[i] }));

        const strategy = calculateMetrics(strategyData, "Custom Portfolio");
        const bench = calculateMetrics(benchmarkData, benchmark);

        // Comparative Metrics
        const stratRets = strategy.dailyReturns;
        const benchRets = bench.dailyReturns;
        const minLen = Math.min(stratRets.length, benchRets.length);
        const sliceStrat = stratRets.slice(stratRets.length - minLen);
        const sliceBench = benchRets.slice(benchRets.length - minLen);

        const rSquaredVal = calculateRSquared(sliceStrat, sliceBench);
        strategy.rSquared = rSquaredVal;
        bench.rSquared = 1.0;

        const beta = calculateBetaHelper(strategy.prices, bench.prices);
        const alpha = (strategy.cagr - (0.02 + beta * (bench.cagr - 0.02)));

        strategy.beta = beta;
        strategy.alpha = alpha;
        bench.beta = 1.0;
        bench.alpha = 0;

        const metricsCompare = [
            { metric: "Current Price", strategy: n(strategy.currentPrice), benchmark: n(bench.currentPrice) },
            { metric: "Risk-Free Rate", strategy: "2.0%", benchmark: "2.0%" },
            { metric: "Time in Market", strategy: "100.0%", benchmark: "100.0%" },
            { isHeader: true },
            { metric: "Cumulative Return", strategy: p(strategy.cumulativeReturns[strategy.cumulativeReturns.length - 1].value), benchmark: p(bench.cumulativeReturns[bench.cumulativeReturns.length - 1].value) },
            { metric: "CAGR%", strategy: p(strategy.cagr), benchmark: p(bench.cagr) },
            { isHeader: true },
            { metric: "Sharpe", strategy: n(strategy.sharpe), benchmark: n(bench.sharpe) },
            { metric: "Sortino", strategy: n(strategy.sortino), benchmark: n(bench.sortino) },
            { metric: "Sortino/√2", strategy: n(strategy.sortino / Math.sqrt(2)), benchmark: n(bench.sortino / Math.sqrt(2)) },
            { isHeader: true },
            { metric: "Max Drawdown", strategy: p(strategy.maxDrawdown), benchmark: p(bench.maxDrawdown) },
            { metric: "Longest DD Days", strategy: strategy.longestDDDays.toFixed(0), benchmark: bench.longestDDDays.toFixed(0) },
            { metric: "Volatility (ann.)", strategy: p(strategy.volatility), benchmark: p(bench.volatility) },
            { metric: "R^2", strategy: n(strategy.rSquared), benchmark: n(bench.rSquared) },
            { metric: "Calmar", strategy: n(strategy.calmar), benchmark: n(bench.calmar) },
            { metric: "Skew", strategy: n(strategy.skew), benchmark: n(bench.skew) },
            { metric: "Kurtosis", strategy: n(strategy.kurtosis), benchmark: n(bench.kurtosis) },
            { isHeader: true },
            { metric: "Expected Daily %", strategy: p(strategy.expectedDaily), benchmark: p(bench.expectedDaily) },
            { metric: "Expected Monthly %", strategy: p(strategy.expectedMonthly), benchmark: p(bench.expectedMonthly) },
            { metric: "Expected Yearly %", strategy: p(strategy.expectedYearly), benchmark: p(bench.expectedYearly) },
            { metric: "Kelly Criterion", strategy: p(strategy.kelly), benchmark: p(bench.kelly) },
            { metric: "Risk of Ruin", strategy: p(strategy.riskOfRuin || 0), benchmark: p(bench.riskOfRuin || 0) },
            { metric: "Daily Value-at-Risk", strategy: p(strategy.vaR), benchmark: p(bench.vaR) },
            { metric: "Expected Shortfall (cVaR)", strategy: p(strategy.cVaR), benchmark: p(bench.cVaR) },
            { isHeader: true },
            { metric: "Gain/Pain Ratio", strategy: n(strategy.gainPain), benchmark: n(bench.gainPain) },
            { metric: "Payoff Ratio", strategy: n(strategy.payoffRatio), benchmark: n(bench.payoffRatio) },
            { metric: "Profit Factor", strategy: n(strategy.profitFactor), benchmark: n(bench.profitFactor) },
            { metric: "Common Sense Ratio", strategy: n((strategy.profitFactor * strategy.tailRatio)), benchmark: n((bench.profitFactor * bench.tailRatio)) },
            { metric: "CPC Index", strategy: n(strategy.cpcIndex || 0), benchmark: n(bench.cpcIndex || 0) },
            { metric: "Tail Ratio", strategy: n(strategy.tailRatio), benchmark: n(bench.tailRatio) },
            { metric: "Outlier Win Ratio", strategy: n(strategy.outlierWinRatio || 0), benchmark: n(bench.outlierWinRatio || 0) },
            { metric: "Outlier Loss Ratio", strategy: n(strategy.outlierLossRatio || 0), benchmark: n(bench.outlierLossRatio || 0) },
            { isHeader: true },
            { metric: "MTD", strategy: p(strategy.mtd), benchmark: p(bench.mtd) },
            { metric: "3M", strategy: p(strategy.r3m), benchmark: p(bench.r3m) },
            { metric: "6M", strategy: p(strategy.r6m), benchmark: p(bench.r6m) },
            { metric: "YTD", strategy: p(strategy.ytd), benchmark: p(bench.ytd) },
            { metric: "1Y", strategy: p(strategy.r1y), benchmark: p(bench.r1y) },
            { metric: "3Y (ann.)", strategy: p(strategy.r3y), benchmark: p(bench.r3y) },
            { metric: "5Y (ann.)", strategy: p(strategy.r5y), benchmark: p(bench.r5y) },
            { metric: "All-time (ann.)", strategy: p(strategy.cagr), benchmark: p(bench.cagr) },
            { isHeader: true },
            { metric: "Best Day", strategy: p(strategy.bestDay), benchmark: p(bench.bestDay) },
            { metric: "Worst Day", strategy: p(strategy.worstDay), benchmark: p(bench.worstDay) },
            { metric: "Best Month", strategy: p(strategy.bestMonth || 0), benchmark: p(bench.bestMonth || 0) },
            { metric: "Worst Month", strategy: p(strategy.worstMonth || 0), benchmark: p(bench.worstMonth || 0) },
            { isHeader: true },
            { metric: "Avg. Drawdown", strategy: p(strategy.avgDrawdown), benchmark: p(bench.avgDrawdown) },
            { metric: "Avg. Drawdown Days", strategy: strategy.longestDDDays ? strategy.longestDDDays.toFixed(0) : "0", benchmark: bench.longestDDDays ? bench.longestDDDays.toFixed(0) : "0" },
            { metric: "Recovery Factor", strategy: n(strategy.recoveryFactor || 0), benchmark: n(bench.recoveryFactor || 0) },
            { metric: "Ulcer Index", strategy: n(strategy.ulcerIndex || 0), benchmark: n(bench.ulcerIndex || 0) },
            { isHeader: true },
            { metric: "Avg. Up Month", strategy: p(strategy.avgUpMonth || 0), benchmark: p(bench.avgUpMonth || 0) },
            { metric: "Avg. Down Month", strategy: p(strategy.avgDownMonth || 0), benchmark: p(bench.avgDownMonth || 0) },
            { isHeader: true },
            { metric: "Win Days %", strategy: p(strategy.winDays || 0), benchmark: p(bench.winDays || 0) },
            { metric: "Win Month %", strategy: p(strategy.winMonths || 0), benchmark: p(bench.winMonths || 0) },
            { metric: "Win Quarter %", strategy: p(strategy.winQuarters || 0), benchmark: p(bench.winQuarters || 0) },
            { metric: "Win Year %", strategy: p(strategy.winYears || 0), benchmark: p(bench.winYears || 0) },
            { metric: "Max Consec. Gain Days", strategy: (strategy.maxConsecutiveGainDays || 0).toFixed(0), benchmark: (bench.maxConsecutiveGainDays || 0).toFixed(0) },
            { metric: "Max Consec. Loss Days", strategy: (strategy.maxConsecutiveLossDays || 0).toFixed(0), benchmark: (bench.maxConsecutiveLossDays || 0).toFixed(0) },
            { metric: "Beta", strategy: n(strategy.beta || 0), benchmark: "-" },
            { metric: "Alpha", strategy: p(strategy.alpha || 0), benchmark: "-" }
        ];

        const monthlyReturns = calculateMonthlyReturnsHelper(strategyData);
        const benchmarkMonthlyReturns = calculateMonthlyReturnsHelper(benchmarkData);

        const yearlyMap = {};
        strategyData.forEach(r => {
            const year = new Date(r.date).getFullYear();
            if (!yearlyMap[year]) yearlyMap[year] = { start: r.close, end: r.close };
            yearlyMap[year].end = r.close;
        });

        const benchYearlyMap = {};
        benchmarkData.forEach(r => {
            const year = new Date(r.date).getFullYear();
            if (!benchYearlyMap[year]) benchYearlyMap[year] = { start: r.close, end: r.close };
            benchYearlyMap[year].end = r.close;
        });

        const eoyReturns = Object.keys(yearlyMap).sort().map(y => {
            const yData = yearlyMap[y];
            const stratRet = (yData.end - yData.start) / yData.start;
            const bData = benchYearlyMap[y];
            const benchRet = bData ? (bData.end - bData.start) / bData.start : 0;
            const multiplier = benchRet !== 0 ? stratRet / benchRet : 0;
            return {
                year: parseInt(y),
                benchmark: (benchRet * 100).toFixed(2) + "%",
                strategy: (stratRet * 100).toFixed(2) + "%",
                multiplier: multiplier.toFixed(2),
                won: stratRet > benchRet ? "+" : "-"
            };
        });

        // Rolling Metrics
        const rollingWindow6m = 126;
        const rollingWindow12m = 252;
        const rollingMetrics = [];

        for (let i = rollingWindow6m; i < strategyData.length; i++) {
            const winStrat = strategy.prices.slice(i - rollingWindow6m, i);
            const winBench = bench.prices.slice(i - rollingWindow6m, i);

            const beta6m = calculateBetaHelper(winStrat, winBench);
            let beta12m = null;
            if (i >= rollingWindow12m) {
                beta12m = calculateBetaHelper(strategy.prices.slice(i - rollingWindow12m, i), bench.prices.slice(i - rollingWindow12m, i));
            }

            const rets6m = [];
            for (let j = 1; j < winStrat.length; j++) rets6m.push((winStrat[j] - winStrat[j - 1]) / winStrat[j - 1]);
            const mean6m = rets6m.reduce((a, b) => a + b, 0) / rets6m.length;
            const vol6m = Math.sqrt(rets6m.reduce((a, b) => a + Math.pow(b - mean6m, 2), 0) / rets6m.length) * Math.sqrt(252);

            const cagr6m = Math.pow(winStrat[winStrat.length - 1] / winStrat[0], 252 / (rollingWindow6m - 1)) - 1;
            const sharpe6m = (cagr6m - 0.02) / (vol6m || 1);

            rollingMetrics.push({
                date: strategyData[i].date,
                beta: beta6m,
                beta12m: beta12m,
                volatility: vol6m,
                sharpe: sharpe6m
            });
        }

        const worstDrawdowns = calculateWorstDrawdowns(strategyData);

        res.json({
            ticker: "Optimized Portfolio",
            isCustom: true,
            metrics: metricsCompare,
            eoyReturns,
            monthlyReturns,
            benchmarkMonthlyReturns,
            cumulativeReturns: strategy.cumulativeReturns,
            benchmarkCumulativeReturns: bench.cumulativeReturns,
            dailyReturns: strategy.dailyReturnsWithDates,
            drawdownHistory: strategy.drawdownHistory,
            strategyPrices: strategy.prices,
            benchmarkPrices: bench.prices,
            worstDrawdowns: worstDrawdowns,
            rollingMetrics: rollingMetrics,
            strategyHistory: strategyData
        });

    } catch (err) {
        console.error("Custom Analysis Error", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getFinancials = async (req, res) => {
    const { ticker } = req.params;
    const { period = 'annual' } = req.query; // 'annual' or 'quarterly'
    console.log(`[DEBUG] getFinancials called for ${ticker} (${period})`);

    try {
        const yahooFinance = new YahooFinance();
        const modules = [
            'balanceSheetHistory', 'balanceSheetHistoryQuarterly',
            'incomeStatementHistory', 'incomeStatementHistoryQuarterly',
            'cashflowStatementHistory', 'cashflowStatementHistoryQuarterly',
            'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'
        ];

        const result = await yahooFinance.quoteSummary(ticker, { modules });

        if (!result) {
            return res.status(404).json({ error: 'No financial data found' });
        }

        const quoteSummary = result;

        // Determine which history to use based on period
        const isQuarterly = period === 'quarterly';
        const incomeStmts = isQuarterly
            ? result.incomeStatementHistoryQuarterly?.incomeStatementHistory
            : result.incomeStatementHistory?.incomeStatementHistory;
        const balanceSheets = isQuarterly
            ? result.balanceSheetHistoryQuarterly?.balanceSheetStatements
            : result.balanceSheetHistory?.balanceSheetStatements;
        const cashFlows = isQuarterly
            ? result.cashflowStatementHistoryQuarterly?.cashflowStatements
            : result.cashflowStatementHistory?.cashflowStatements;

        // Merge Time Series
        // Create a map by date to merge objects
        const byDate = {};

        const addToMap = (arr) => {
            if (Array.isArray(arr)) {
                arr.forEach(item => {
                    const d = item.endDate ? new Date(item.endDate).toISOString().split('T')[0] : null;
                    if (d) {
                        if (!byDate[d]) byDate[d] = { date: item.endDate }; // store original date obj
                        Object.assign(byDate[d], item);
                    }
                });
            }
        };

        addToMap(incomeStmts);
        addToMap(balanceSheets);
        addToMap(cashFlows);

        const timeSeries = Object.values(byDate);

        // Sort by date descending (newest first)
        const sortedSeries = timeSeries.sort((a, b) => new Date(b.date) - new Date(a.date));

        const incomeStatement = sortedSeries.map(item => ({
            endDate: item.date,
            totalRevenue: item.totalRevenue,
            costOfRevenue: item.costOfRevenue,
            grossProfit: item.grossProfit,
            totalOperatingExpenses: item.totalOperatingExpenses || (item.totalRevenue - item.operatingIncome),
            operatingIncome: item.operatingIncome,
            ebit: item.ebit || item.operatingIncome,
            interestExpense: item.interestExpense,
            netIncome: item.netIncome,
        }));

        const balanceSheet = sortedSeries.map(item => ({
            endDate: item.date,
            totalAssets: item.totalAssets,
            totalCurrentAssets: item.totalCurrentAssets || item.currentAssets,
            cash: item.cashAndCashEquivalents || item.cash,
            inventory: item.inventory,
            totalLiab: item.totalLiabilitiesNetMinorityInterest || item.totalLiab,
            totalCurrentLiabilities: item.currentLiabilities || item.totalCurrentLiabilities,
            longTermDebt: item.longTermDebt,
            totalStockholderEquity: item.stockholdersEquity || item.totalEquityGrossMinorityInterest,
        }));

        const cashFlow = sortedSeries.map(item => ({
            endDate: item.date,
            totalCashFromOperatingActivities: item.operatingCashFlow || item.cashFlowFromContinuingOperatingActivities,
            totalCashflowsFromInvestingActivities: item.investingCashFlow || item.cashFlowFromContinuingInvestingActivities,
            capitalExpenditures: item.capitalExpenditure,
            totalCashFromFinancingActivities: item.financingCashFlow || item.cashFlowFromContinuingFinancingActivities,
            changeInCash: item.changesInCash,
        }));

        // Process Metrics from quoteSummary
        const stats = quoteSummary.defaultKeyStatistics || {};
        const finData = quoteSummary.financialData || {};
        const summary = quoteSummary.summaryDetail || {};
        const price = quoteSummary.price || {};

        const metrics = {
            peRatio: summary.trailingPE || stats.forwardPE,
            forwardPE: stats.forwardPE,
            pegRatio: stats.pegRatio,
            priceToBook: stats.priceToBook,
            evToEbitda: stats.enterpriseToEbitda,
            profitMargin: finData.profitMargins,
            operatingMargin: finData.operatingMargins,
            roe: finData.returnOnEquity,
            roa: finData.returnOnAssets,
            dividendYield: summary.dividendYield,
            payoutRatio: summary.payoutRatio,
            currentRatio: finData.currentRatio,
            quickRatio: finData.quickRatio,
            debtToEquity: finData.debtToEquity,
            freeCashFlow: finData.freeCashflow,
            marketCap: price.marketCap,
            price: price.regularMarketPrice,
            currency: price.currency
        };

        res.json({
            ticker: ticker.toUpperCase(),
            metrics,
            incomeStatement,
            balanceSheet,
            cashFlow
        });

    } catch (err) {
        console.error("Error in getFinancials:", err);
        res.status(500).json({ error: "Failed to fetch financial data", details: err.message });
    }
};
