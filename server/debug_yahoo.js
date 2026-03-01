const pkg = require('yahoo-finance2');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'debug_output.txt');
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

async function testYahoo() {
    try {
        fs.writeFileSync(logFile, 'Starting debug...\n');
        log("Testing chart() method...");
        const yahooFinance = new pkg.default();
        const res = await yahooFinance.chart('AAPL', {
            period1: '2024-01-01',
            period2: new Date().toISOString().split('T')[0],
            interval: '1d'
        });

        log("Result Keys: " + Object.keys(res).join(', '));
        if (res.quotes) {
            log("Quotes length: " + res.quotes.length);
            log("First quote: " + JSON.stringify(res.quotes[0]));
        } else {
            log("Result is array? " + Array.isArray(res));
        }
    } catch (e) {
        log("Error: " + e.message);
        log("Stack: " + e.stack);
        if (e.errors) log("YF Errors: " + JSON.stringify(e.errors));
    }
}

testYahoo();
