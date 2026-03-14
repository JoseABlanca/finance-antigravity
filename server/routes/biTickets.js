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

// Initialize Gemini API - corrected initialization with object param
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
        case '.webp': return 'image/webp';
        case '.heic': return 'image/heic';
        case '.heif': return 'image/heif';
        case '.pdf': return 'application/pdf';
        default: return 'application/octet-stream';
    }
};

// Route to check server status and AI configuration
router.get('/debug-status', (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    const keyPrefix = hasKey ? process.env.GEMINI_API_KEY.substring(0, 6) : 'N/A';
    res.json({
        status: 'ok',
        ai_configured: hasKey,
        key_prefix: keyPrefix,
        node_env: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
});

router.post('/upload', upload.single('receipt'), async (req, res) => {
    try {
        console.log('[AI-Tickets] Inicio de procesamiento de ticket');
        
        if (!req.file) {
            console.error('[AI-Tickets] Error: No se ha recibido ningún archivo');
            return res.status(400).json({ error: 'No image file uploaded.' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[AI-Tickets] Error: GEMINI_API_KEY no configurada');
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in the server.' });
        }
        console.log(`[AI-Tickets] API Key detectada (longitud: ${apiKey.length})`);

        const filePath = req.file.path;
        const mimeType = getMimeType(filePath);
        console.log(`[AI-Tickets] Procesando archivo: ${filePath} (Mime: ${mimeType})`);
        
        // 1. Convert image to Gemini part
        const imagePart = fileToGenerativePart(filePath, mimeType);

        // 2. Define the schema for structured output (moved inside for freshness)
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
                        required: ["product_name", "quantity", "total_price", "category"]
                    }
                }
            },
            required: ["receipt_date", "supermarket", "total_amount", "items"]
        };

        // 3. Call Gemini API - Using new API syntax
        const promptText = "Analyze this receipt image. Extract the date (YYYY-MM-DD), supermarket name, total amount, and a detailed list of items. Return as JSON.";
        
        console.log('[AI-Tickets] Llamando a Gemini API (gemini-2.0-flash)...');
        
        const result = await genAI.models.generateContent({
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

        const textResponse = result.text;
        console.log('[AI-Tickets] Respuesta recibida de Gemini');
        
        let extractedData;
        try {
            extractedData = JSON.parse(textResponse);
        } catch (parseError) {
            console.error('[AI-Tickets] Error al parsear JSON:', parseError.message);
            console.error('[AI-Tickets] Raw Content:', textResponse);
            return res.status(500).json({ 
                error: 'AI returned invalid JSON', 
                details: parseError.message,
                raw: textResponse 
            });
        }
        
        // 4. Save to Database
        console.log(`[AI-Tickets] Guardando ticket de ${extractedData.supermarket} en DB...`);
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
        console.log(`[AI-Tickets] Header guardado con ID: ${receiptId}`);
        
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
            console.log(`[AI-Tickets] ${extractedData.items.length} productos guardados.`);
        }
        
        res.json({
            message: 'Receipt processed successfully',
            receipt_id: receiptId,
            data: extractedData,
            image_url: imageUrl
        });

    } catch (error) {
        console.error('[AI-Tickets] ERROR CRÍTICO:', error);
        res.status(500).json({ 
            error: 'Failed to process receipt via AI', 
            details: error.message,
            code: error.status || error.code || 'UNKNOWN_ERROR'
        });
    }
});

// ============================================================
// EMAIL ALERTS ENDPOINTS
// ============================================================

// GET all email alerts
router.get('/email-alerts', (req, res) => {
    try {
        const alerts = db.prepare(
            'SELECT * FROM email_alerts ORDER BY received_at DESC LIMIT 50'
        ).all();
        res.json(alerts);
    } catch (error) {
        console.error('[EmailAlerts] Error fetching alerts:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// PUT mark alert as read
router.put('/email-alerts/:id/read', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('UPDATE email_alerts SET status = ? WHERE id = ?').run('read', id);
        res.json({ message: 'Alerta marcada como leída' });
    } catch (error) {
        console.error('[EmailAlerts] Error marking alert:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST trigger manual email check
router.post('/trigger-email-check', async (req, res) => {
    try {
        console.log('[EmailAlerts] Comprobación manual de emails iniciada...');
        processUnreadEmails();
        res.json({ message: 'Comprobación de emails iniciada en segundo plano' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET endpoints for BI Dashboard
router.get('/', (req, res) => {
    try {
        const receipts = db.prepare('SELECT * FROM receipts ORDER BY date DESC').all();
        res.json(receipts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/items', (req, res) => {
    try {
        const items = db.prepare(`
            SELECT ri.*, r.date, r.supermarket 
            FROM receipt_items ri
            JOIN receipts r ON ri.receipt_id = r.id
            ORDER BY r.date DESC
        `).all();
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
