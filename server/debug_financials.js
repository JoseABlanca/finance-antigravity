const YahooFinance = require('yahoo-finance2').default;

async function testFinancials(ticker) {
    console.log(`Testing financials for ${ticker}...`);
    try {
        const yahooFinance = new YahooFinance();
        // const queryOptions = { modules: ['balanceSheetHistory', 'incomeStatementHistory', 'cashflowStatementHistory', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'] };
        // const result = await yahooFinance.quoteSummary(ticker, queryOptions);

        console.log("Fetching fundamentalsTimeSeries...");
        // Try as a method
        try {
            console.log("Attempting with { validateResult: false }...");
            const result = await yahooFinance.fundamentalsTimeSeries(ticker, { period1: '2020-01-01', type: 'annual', module: 'all' }, { validateResult: false });

            if (result.length > 0) {
                const item = result[0];
                console.log("ALL KEYS available in one item:", Object.keys(item).sort().join(', '));
                console.log("Sample Item:", JSON.stringify(item, null, 2));
            } else {
                console.log("No results found.");
            }
        } catch (e) {
            console.log("Method fundamentalsTimeSeries failed:", e.message);
        }

        // Also fetch price/summary for metrics
        const metricsResult = await yahooFinance.quoteSummary(ticker, { modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'] });
        console.log("Metrics result keys:", Object.keys(metricsResult));

        return; // Stop here for now

        // check specific fields that might be missing
        const modules = ['balanceSheetHistory', 'incomeStatementHistory', 'cashflowStatementHistory', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'];
        modules.forEach(m => {
            if (!result[m]) console.log(`WARNING: Module ${m} is missing or null`);
            else {
                console.log(`Module ${m} is present`);
                if (m.includes('History')) {
                    const data = result[m][m]; // e.g. result.balanceSheetHistory.balanceSheetHistory
                    // Actually usually it is result.balanceSheetHistory.balanceSheetStatements
                    const key = m === 'balanceSheetHistory' ? 'balanceSheetStatements' : m === 'incomeStatementHistory' ? 'incomeStatementHistory' : 'cashflowStatements';
                    const arr = result[m][key];
                    if (arr && arr.length > 0) {
                        console.log(`  First item structure:`, JSON.stringify(arr[0], null, 2));
                    }
                }
            }
        });

    } catch (err) {
        console.error("Error fetching financials:", err);
    }
}

testFinancials('SOFI');
