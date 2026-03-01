const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: '*', // Allows access from any origin (e.g., Firebase Hosting and Localhost)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const accountRoutes = require('./routes/accountRoutes');
const financeRoutes = require('./routes/financeRoutes');
const reportRoutes = require('./routes/reportRoutes');

app.use('/api/accounts', accountRoutes);
app.use('/api', financeRoutes);
app.use('/api/reports', reportRoutes);


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
