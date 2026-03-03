const Database = require('libsql');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'libsql://finance-financeantigravity.aws-eu-west-1.turso.io';
const dbToken = process.env.DATABASE_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiI0ZWZjYmEwMi0wYWQzLTQ3NTctOTI4MC0xNjY3YTU2NmMwNWUiLCJpYXQiOjE3NzIzOTgxMjAsInJpZCI6ImRjMTFlODFkLWY2OWEtNGY1MC05MzQ4LTBhZmY4Y2NiOTMxOSJ9.4UEOlgJxPjNihZAXYyh1J5RWucF9KhldwyUJZvS1_tsEj7lkVgLFEYwjnrnOMixNWWxKM597KzD2UFQvfiSRAg';

const db = new Database(dbUrl, {
    authToken: dbToken
});

async function checkTrades() {
    try {
        const trades = db.prepare("SELECT count(*) as count FROM investment_trades").get();
        console.log("Registered trades count:", trades.count);

        if (trades.count > 0) {
            const firstFew = db.prepare("SELECT * FROM investment_trades LIMIT 5").all();
            console.log("First 5 trades:", firstFew);
        }
    } catch (err) {
        console.error("Error checking trades:", err);
    }
}

checkTrades();
