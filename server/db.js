const Database = require('libsql');
const path = require('path');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'libsql://finance-financeantigravity.aws-eu-west-1.turso.io';
const dbToken = process.env.DATABASE_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiI0ZWZjYmEwMi0wYWQzLTQ3NTctOTI4MC0xNjY3YTU2NmMwNWUiLCJpYXQiOjE3NzIzOTgxMjAsInJpZCI6ImRjMTFlODFkLWY2OWEtNGY1MC05MzQ4LTBhZmY4Y2NiOTMxOSJ9.4UEOlgJxPjNihZAXYyh1J5RWucF9KhldwyUJZvS1_tsEj7lkVgLFEYwjnrnOMixNWWxKM597KzD2UFQvfiSRAg';

const db = new Database(dbUrl, {
    authToken: dbToken
});

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON');

function initDb() {
    console.log('Skipping schema initialization (Database is managed remotely on Turso)');
}

initDb();

module.exports = db;
