const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI, Type } = require('@google/genai');
const { processUnreadEmails } = require('../services/emailReader');
const db = require('../db');

// Setup multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Utility to convert local file to Gemini API part format
function fileToGenerativePart(filePath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType
        },
    };
}

// Map file extensions to mime types
const getMimeType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.png': return 'image/png';
        case '.jpeg':
        case '.jpg': return 'image/jpeg';
        case '.pdf': return 'application/pdf';
        default: return 'image/jpeg';
    }
};

/**
 * POST /api/bi/tickets/upload
 * Subida y procesamiento de ticket con Gemini AI
 */
router.post('/upload', upload.single('receipt'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No request file provided' });
    }

    const filePath = req.file.path;
    const mimeType = getMimeType(filePath);

    try {
        // 1. Prepare Generative Part
        const imagePart = fileToGenerativePart(filePath, mimeType);

        // 2. Define Response Schema
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                receipt_date: { type: Type.STRING },
                supermarket: { type: Type.STRING },
                total_amount: { type: Type.NUMBER },
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            product_name: { type: Type.STRING },
                            quantity: { type: Type.NUMBER },
                            price_per_unit: { type: Type.NUMBER },
                            total_price: { type: Type.NUMBER },
                            category: { type: Type.STRING }
                        },
                        required: ["product_name", "total_price"]
                    }
                }
            },
            required: ["receipt_date", "supermarket", "total_amount", "items"]
        };

        // 3. Call Gemini API with Retry Logic for 429 errors
        const promptText = "Analyze this receipt image. Extract the date (YYYY-MM-DD), supermarket name, total amount, and a detailed list of items. Return as JSON.";
        
        addLog('INFO', 'AI-Tickets', 'Llamando a Gemini (gemini-2.0-flash) con reintentos...');
        
        let result;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (attempts < maxAttempts) {
            try {
                result = await genAI.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [{ 
                        role: 'user', 
                        parts: [
                            { text: promptText },
                            imagePart
                        ] 
                    }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    }
                });
                break; // Success
            } catch (error) {
                attempts++;
                const isQuotaError = error.message?.includes('429') || error.status === 429 || error.code === 429;
                
                if (isQuotaError && attempts < maxAttempts) {
                    const waitTime = Math.pow(2, attempts) * 1500 + Math.random() * 1500;
                    addLog('WARN', 'AI-Tickets', `Cuota excedida (429). Reintentando en ${Math.round(waitTime/1000)}s... (Intento ${attempts}/${maxAttempts})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    throw error; // Rethrow if not a quota error or max attempts reached
                }
            }
        }

        const textResponse = result.text;
        addLog('DEBUG', 'AI-Tickets', 'Respuesta recibida correctamente');
            
            let extractedData;
            try {
                extractedData = JSON.parse(textResponse);
            } catch (parseError) {
                addLog('ERROR', 'AI-Tickets', `JSON Inválido: ${parseError.message}`);
                return res.status(500).json({ error: 'AI returned invalid JSON', details: parseError.message });
            }
        
        // 4. Save to Database
        addLog('INFO', 'AI-Tickets', `Guardando ticket de ${extractedData.supermarket} - ${extractedData.total_amount}€`);
        const imageUrl = `/uploads/${path.basename(filePath)}`;
        
        const headerResult = db.prepare(`
            INSERT INTO receipts (date, supermarket, total_amount, image_url) 
            VALUES (?, ?, ?, ?)
        `).run(
            extractedData.receipt_date || new Date().toISOString().split('T')[0],
            extractedData.supermarket || 'Unknown',
            extractedData.total_amount || 0,
            imageUrl
        );
        
        const receiptId = headerResult.lastInsertRowid;
        
        // Insert Items
        if (extractedData.items && extractedData.items.length > 0) {
            const insertItem = db.prepare(`
                INSERT INTO receipt_items (receipt_id, product_name, quantity, price_per_unit, total_price, category)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            extractedData.items.forEach(item => {
                insertItem.run(
                    receiptId,
                    item.product_name,
                    item.quantity || 1,
                    item.price_per_unit || item.total_price,
                    item.total_price,
                    item.category || 'Other'
                );
            });
            addLog('INFO', 'AI-Tickets', `${extractedData.items.length} productos guardados.`);
        }
        
        res.json({
            message: 'Receipt processed successfully',
            receipt_id: receiptId,
            data: extractedData,
            image_url: imageUrl
        });

    } catch (error) {
        addLog('ERROR', 'AI-Tickets', `Error en procesamiento: ${error.message}`);
        res.status(500).json({ 
            error: 'Failed to process receipt via AI', 
            details: error.message,
            code: error.status || error.code || 'UNKNOWN_ERROR'
        });
    }
});

/**
 * EMAIL ALERTS ENDPOINTS
 */

// GET all email alerts
router.get('/email-alerts', (req, res) => {
    try {
        const alerts = db.prepare('SELECT * FROM email_alerts ORDER BY received_at DESC LIMIT 50').all();
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// MARK as read
router.put('/email-alerts/:id/read', (req, res) => {
    try {
        db.prepare('UPDATE email_alerts SET status = "read" WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TRIGGER check
router.post('/trigger-email-check', async (req, res) => {
    try {
        addLog('INFO', 'EmailAlerts', 'Comprobación manual iniciada');
        processUnreadEmails(); // Async background
        res.json({ message: 'Comprobación iniciada en segundo plano' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// System Logs Endpoint (Debug)
router.get('/logs', (req, res) => {
    try {
        const logs = db.prepare('SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 100').all();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/items', (req, res) => {
    try {
        const items = db.prepare(`
            SELECT i.*, r.supermarket, r.date 
            FROM receipt_items i
            JOIN receipts r ON i.receipt_id = r.id
            ORDER BY r.date DESC
        `).all();
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
