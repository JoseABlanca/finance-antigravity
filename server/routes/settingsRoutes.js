const express = require('express');
const router = express.Router();
const db = require('../db');

// GET settings
router.get('/', (req, res) => {
    try {
        const settings = db.prepare('SELECT * FROM app_settings').all();
        const settingsObj = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        res.json(settingsObj);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST/PUT settings
router.post('/', (req, res) => {
    const { settings } = req.body; // Expecting { key1: value1, key2: value2 }
    try {
        const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
        const transaction = db.transaction((settingsObj) => {
            for (const [key, value] of Object.entries(settingsObj)) {
                stmt.run(key, value);
            }
        });
        transaction(settings);
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
