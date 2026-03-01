const Database = require('libsql');

try {
    const db = new Database('libsql://finance-financeantigravity.aws-eu-west-1.turso.io', {
        authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiI0ZWZjYmEwMi0wYWQzLTQ3NTctOTI4MC0xNjY3YTU2NmMwNWUiLCJpYXQiOjE3NzIzOTgxMjAsInJpZCI6ImRjMTFlODFkLWY2OWEtNGY1MC05MzQ4LTBhZmY4Y2NiOTMxOSJ9.4UEOlgJxPjNihZAXYyh1J5RWucF9KhldwyUJZvS1_tsEj7lkVgLFEYwjnrnOMixNWWxKM597KzD2UFQvfiSRAg'
    });

    const version = db.prepare('SELECT sqlite_version() as version').get();
    console.log('Successfully connected to Turso! SQLite version:', version);

    // Test creating a table
    db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)');
    db.exec('INSERT INTO test (name) VALUES ("Hello Turso")');
    const result = db.prepare('SELECT * FROM test').all();
    console.log('Results:', result);
    db.exec('DROP TABLE test');

} catch (err) {
    console.error('Failed to connect or query:', err);
}
