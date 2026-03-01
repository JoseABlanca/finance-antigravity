const http = require('http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body }));
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function run() {
    try {
        // 1. Get Accounts (for valid IDs)
        console.log("Fetching Accounts...");
        const accRes = await request({ hostname: 'localhost', port: 3001, path: '/api/accounts', method: 'GET' });

        if (accRes.statusCode !== 200) {
            console.error("Failed to fetch accounts:", accRes.statusCode, accRes.body);
            return;
        }

        const accounts = JSON.parse(accRes.body);
        const cashAcc = accounts.find(a => a.type === 'ASSET');

        if (!cashAcc) {
            console.error("No asset account found to use for trade.");
            return;
        }

        const tradeData = {
            date: new Date().toISOString().split('T')[0],
            symbol: 'SOFI',
            action: 'BUY',
            quantity: 100,
            price: 15.50,
            fee: 1.0,
            currency: 'USD',
            exchange_rate: 0.92,
            cashAccountId: cashAcc.id,
            assetAccountId: cashAcc.id
        };

        // 2. Add Trade
        console.log("Adding Trade...");
        const addRes = await request({
            hostname: 'localhost', port: 3001, path: '/api/investments/trade', method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, tradeData);
        console.log("Add Trade Result:", addRes.statusCode, addRes.body);

        // 3. Get Portfolio
        console.log("\nFetching Portfolio...");
        const portRes = await request({ hostname: 'localhost', port: 3001, path: '/api/investments/portfolio', method: 'GET' });
        console.log("Portfolio:", portRes.body);

        // 4. Analyze Portfolio
        console.log("\nAnalyzing Portfolio...");
        const analyzeRes = await request({ hostname: 'localhost', port: 3001, path: '/api/investments/analyze/PORTFOLIO?currency=EUR', method: 'GET' });
        console.log("Analysis Result Status:", analyzeRes.statusCode);
        console.log("Analysis Result Body Length:", analyzeRes.body.length);
        if (analyzeRes.statusCode !== 200) {
            console.log("Error Body:", analyzeRes.body);
        } else {
            const data = JSON.parse(analyzeRes.body);
            console.log("Strategy Prices Count:", data.strategyPrices ? data.strategyPrices.length : 0);
            if (data.strategyPrices && data.strategyPrices.length > 0) {
                console.log("Last Price:", data.strategyPrices[data.strategyPrices.length - 1]);
            }
        }

    } catch (err) {
        console.error("Test Failed:", err);
    }
}

run();
