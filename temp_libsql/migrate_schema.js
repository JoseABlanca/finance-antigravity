const Database = require('libsql');
const fs = require('fs');
const path = require('path');

try {
    const db = new Database('libsql://finance-financeantigravity.aws-eu-west-1.turso.io', {
        authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiI0ZWZjYmEwMi0wYWQzLTQ3NTctOTI4MC0xNjY3YTU2NmMwNWUiLCJpYXQiOjE3NzIzOTgxMjAsInJpZCI6ImRjMTFlODFkLWY2OWEtNGY1MC05MzQ4LTBhZmY4Y2NiOTMxOSJ9.4UEOlgJxPjNihZAXYyh1J5RWucF9KhldwyUJZvS1_tsEj7lkVgLFEYwjnrnOMixNWWxKM597KzD2UFQvfiSRAg'
    });

    console.log('Connected to Turso. Executing schema...');

    // Read the schema file
    const schemaPath = path.join(__dirname, '..', 'server', 'database_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // LibSQL / better-sqlite3 uses .exec() for multiple statements
    db.exec(schemaSql);

    console.log('✅ Schema executed successfully on Turso!');

    // Let's also check if tables were created
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables in Turso:', tables);

} catch (err) {
    console.error('Failed to migrate schema:', err);
}
