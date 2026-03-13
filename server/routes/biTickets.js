const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI, Type } = require('@google/genai');
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
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
        console.log(`[AI-Tickets] API Key verificada (termina en: ${apiKey.substring(apiKey.length - 4)})`);

        const filePath = req.file.path;
        const mimeType = getMimeType(filePath);
        console.log(`[AI-Tickets] Procesando archivo: ${filePath} (Mime: ${mimeType})`);
        
        // 1. Convert image to Gemini part
        const imagePart = fileToGenerativePart(filePath, mimeType);

        // 2. Define the schema for structured output
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                receipt_date: {
                    type: Type.STRING,
                    description: "The date of the receipt in YYYY-MM-DD format."
                },
                supermarket: {
                    type: Type.STRING,
                    description: "The name of the supermarket or store."
                },
                total_amount: {
                    type: Type.NUMBER,
                    description: "The total amount paid."
                },
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            product_name: { type: Type.STRING },
                            quantity: { type: Type.NUMBER, description: "Quantity or weight. If not specified but there's a price, assume 1." },
                            price_per_unit: { type: Type.NUMBER, description: "Price per unit/kg. If not specified, use total_price." },
                            total_price: { type: Type.NUMBER, description: "Total price paid for this specific line item." },
                            category: { 
                                type: Type.STRING, 
                                description: "Assign a broad grocery category like 'Meat', 'Dairy', 'Produce', 'Bakery', 'Drinks', 'Pantry', 'Cleaning', 'Personal Care', etc." 
                            }
                        },
                        required: ["product_name", "quantity", "total_price", "category"]
                    }
                }
            },
            required: ["receipt_date", "supermarket", "total_amount", "items"]
        };

        // 3. Call Gemini API
        const prompt = "Analyze this receipt image. Extract the date, supermarket name, total amount, and a detailed list of all purchased items including their prices and quantities. Return the data adhering strictly to the JSON schema requested.";
        
        console.log('[AI-Tickets] Llamando a Gemini API...');
        const response = await ai.getGenerativeModel({ model: 'gemini-1.5-flash' }).generateContent({
            contents: [prompt, imagePart],
            generationConfig: {
                responseMimeType: "application/json",
                // Note: responseSchema can sometimes be finicky depending on the model/sdk version
                // but we'll try to keep it for structured output
                responseSchema: responseSchema,
            }
        });

        const textResponse = response.response.text();
        console.log('[AI-Tickets] Respuesta recibida de Gemini');
        
        let extractedData;
        try {
            extractedData = JSON.parse(textResponse);
        } catch (parseError) {
            console.error('[AI-Tickets] Error al parsear JSON:', parseError.message);
            console.error('[AI-Tickets] Raw Response:', textResponse);
            return res.status(500).json({ error: 'AI returned invalid JSON', details: textResponse });
        }
        
        // 4. Save to Database
        console.log(`[AI-Tickets] Guardando ticket de ${extractedData.supermarket} en DB...`);
        const imageUrl = `/uploads/${path.basename(filePath)}`;
        
        // Insert Header
        const result = db.prepare(`
            INSERT INTO receipts (date, supermarket, total_amount, image_url) 
            VALUES (?, ?, ?, ?)
        `).run(
            extractedData.receipt_date || new Date().toISOString().split('T')[0],
            extractedData.supermarket || 'Unknown',
            extractedData.total_amount || 0,
            imageUrl
        );
        
        const receiptId = result.lastInsertRowid;
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
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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
