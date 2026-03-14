const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const cron = require('node-cron');
const db = require('./db');
const { processUnreadEmails } = require('./services/emailReader');

// Ensure email_alerts table exists (safe to run each startup)
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS email_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at TEXT NOT NULL,
            sender TEXT,
            subject TEXT,
            vendor TEXT,
            amount REAL DEFAULT 0,
            is_expense INTEGER DEFAULT 1,
            journal_entry_id INTEGER,
            status TEXT DEFAULT 'unread',
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
    console.log('[DB] Tabla email_alerts verificada/creada.');
} catch (e) {
    console.error('[DB] Error creando tabla email_alerts:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Schedule the AI Email Reader to run every hour at minute 0
cron.schedule('0 * * * *', () => {
    console.log(`[CronJob] Ejecutando lectura programada de correos: ${new Date().toISOString()}`);
    processUnreadEmails();
});

app.use(cors({
    origin: '*', // Allows access from any origin (e.g., Firebase Hosting and Localhost)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const accountRoutes = require('./routes/accountRoutes');
const financeRoutes = require('./routes/financeRoutes');
const reportRoutes = require('./routes/reportRoutes');
const biTicketsRoutes = require('./routes/biTickets');
const settingsRoutes = require('./routes/settingsRoutes');

// Serve static files from the uploads directory for receipt images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/accounts', accountRoutes);
app.use('/api', financeRoutes); // Mount at root /api to let it handle /transactions and /investments
app.use('/api/reports', reportRoutes);
app.use('/api/bi/tickets', biTicketsRoutes);
app.use('/api/settings', settingsRoutes);


// API Routes Placeholder
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    try {
        const logPath = path.join(__dirname, 'server_error.log');
        const logContent = `\n[${new Date().toISOString()}] GLOBAL ERROR:\n${err.stack || err}\n-------------------\n`;
        fs.appendFileSync(logPath, logContent);
    } catch (e) {
        console.error('Failed to log error:', e);
    }
    res.status(500).json({ error: 'Internal Server Error', details: err.message || 'Unknown error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
