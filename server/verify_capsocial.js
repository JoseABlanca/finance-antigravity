const db = require('./db');
const accounts = db.prepare("SELECT code, name, type FROM accounts WHERE code LIKE '100%'").all();
console.log(JSON.stringify(accounts, null, 2));
process.exit(0);
