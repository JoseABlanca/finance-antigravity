const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
const { GoogleGenAI, Type } = require('@google/genai');
const db = require('../db');

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getSettings() {
    try {
        const rows = db.prepare('SELECT * FROM app_settings').all();
        return rows.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
    } catch (err) {
        return {};
    }
}

async function processUnreadEmails() {
    const settings = await getSettings();
    const imapUser = settings.IMAP_USER || process.env.IMAP_USER;
    const imapPass = settings.IMAP_PASSWORD || process.env.IMAP_PASSWORD;

    if (!imapUser || !imapPass) {
        addLog('WARN', 'EmailService', 'Credenciales IMAP no configuradas.');
        return;
    }
    if (!process.env.GEMINI_API_KEY) {
        addLog('WARN', 'EmailService', 'GEMINI_API_KEY no configurada.');
        return;
    }

    const config = {
        imap: {
            user: imapUser,
            password: imapPass,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 5000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    addLog('INFO', 'EmailService', `Conectando a IMAP: ${imapUser}`);
    let connection;
    
    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        // Search last 2 days
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 2);
        const searchCriteria = [['SINCE', sinceDate]];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        addLog('INFO', 'EmailService', `Encontrados ${messages.length} correos en 48h.`);

        for (const item of messages) {
            const all = item.parts.find(p => p.which === '');
            const id = item.attributes.uid;
            const idHeader = "Imap-Id: " + id + "\r\n";
            
            try {
                const parsedMail = await simpleParser(idHeader + all.body);
                const senderAddress = parsedMail.from?.value?.[0]?.address || parsedMail.from?.text || 'Desconocido';
                const receivedAt = parsedMail.date ? parsedMail.date.toISOString() : new Date().toISOString();
                const subject = parsedMail.subject || '(Sin asunto)';

                // DEDUPLICATION
                const existing = db.prepare('SELECT id FROM email_alerts WHERE sender = ? AND subject = ? AND received_at = ?').get(senderAddress, subject, receivedAt);
                if (existing) continue;

                // FILTER: Only process emails with "Factura" in subject (as requested)
                if (!subject.toLowerCase().includes('factura')) {
                    addLog('DEBUG', 'EmailService', `Saltando: "${subject}" (No incluye "Factura")`);
                    continue;
                }

                addLog('DEBUG', 'EmailService', `Procesando: "${subject}" de ${senderAddress}`);
                
                let emailText = parsedMail.text || parsedMail.textAsHtml || '';
                if (emailText.length > 3000) emailText = emailText.substring(0, 3000);
                
                let attachmentPart = null;
                const attachments = parsedMail.attachments || [];
                for (const att of attachments) {
                    if (att.contentType.startsWith('image/') || att.contentType === 'application/pdf') {
                        attachmentPart = {
                            inlineData: {
                                data: att.content.toString("base64"),
                                mimeType: att.contentType
                            }
                        };
                        addLog('DEBUG', 'EmailService', `Adjunto detectado: ${att.filename} (${att.contentType})`);
                        break;
                    }
                }

                // RATE LIMITING: Wait 2 seconds before calling Gemini to respect free tier quota (15 RPM)
                await new Promise(resolve => setTimeout(resolve, 2000));

                const responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        is_invoice_or_receipt: { type: Type.BOOLEAN },
                        date: { type: Type.STRING },
                        amount: { type: Type.NUMBER },
                        concept: { type: Type.STRING },
                        is_expense: { type: Type.BOOLEAN },
                        vendor: { type: Type.STRING },
                        bank_name: { type: Type.STRING, enum: ["BBVA", "Sabadell", "TradeRepublic", "Unknown"] }
                    },
                    required: ["is_invoice_or_receipt", "date", "amount", "concept", "is_expense", "vendor", "bank_name"]
                };

                const promptText = `Analiza este correo y cualquier adjunto para determinar si es una factura o justificante de pago.
                Identifica también si se menciona algún banco emisor del pago entre: BBVA, Sabadell o TradeRepublic.
                Subject: ${subject}
                Body: ${emailText}`;

                const modelName = 'gemini-2.0-flash';
                addLog('DEBUG', 'EmailService', `Llamando a Gemini (${modelName})...`);

                const result = await genAI.models.generateContent({
                    model: modelName,
                    contents: attachmentPart ? [{ text: promptText }, attachmentPart] : [{ text: promptText }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    }
                });

                const data = JSON.parse(result.text);

                if (data.is_invoice_or_receipt) {
                    addLog('INFO', 'EmailService', `Factura detectada: ${data.vendor} - ${data.amount}€ (Banco: ${data.bank_name})`);
                    
                    let journalEntryId = null;
                    if (data.amount && data.amount > 0) {
                        try {
                            const entryDate = data.date || new Date().toISOString().split('T')[0];
                            const entryComment = `Auto Email: ${data.vendor || 'Unknown'} - ${data.concept || 'Factura mail'}`;
                            
                            const entryResult = db.prepare(`INSERT INTO journal_entries (date, comment) VALUES (?, ?)`).run(entryDate, entryComment);
                            journalEntryId = entryResult.lastInsertRowid;
                            
                            const insertLine = db.prepare(`INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?)`);
                            
                            // Bank Mapping
                            const BANK_IDS = {
                                "BBVA": 100,
                                "TradeRepublic": 101,
                                "Sabadell": 102,
                                "Unknown": 100 // Default to BBVA if unknown
                            };
                            const bankAccountId = BANK_IDS[data.bank_name] || 100;
                            const EXPENSE_ACC = 104; // Compras de mercaderías
                            const INCOME_ACC = 34; // Ingresos por Servicios (fallback)

                            if (data.is_expense) {
                                // Gasto: Debe Mercaderías (104), Haber Banco
                                insertLine.run(journalEntryId, EXPENSE_ACC, data.amount, 0);
                                insertLine.run(journalEntryId, bankAccountId, 0, data.amount);
                            } else {
                                // Ingreso: Debe Banco, Haber Ingresos
                                insertLine.run(journalEntryId, bankAccountId, data.amount, 0);
                                insertLine.run(journalEntryId, INCOME_ACC, 0, data.amount);
                            }
                            addLog('SUCCESS', 'EmailService', `Asiento contable ID ${journalEntryId} creado (${data.bank_name} -> ${EXPENSE_ACC})`);
                        } catch (dbErr) {
                            addLog('ERROR', 'EmailService', `Error creando asiento: ${dbErr.message}`);
                        }
                    }

                    db.prepare(`
                        INSERT INTO email_alerts (received_at, sender, subject, vendor, amount, is_expense, journal_entry_id, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'unread')
                    `).run(receivedAt, senderAddress, subject, data.vendor, data.amount, data.is_expense ? 1 : 0, journalEntryId);
                    
                    addLog('SUCCESS', 'EmailService', `Alerta guardada para ${subject}`);
                }
                
                // Mark as seen only IF we processed it or it's not a bill
                await connection.addFlags(id, ['\\Seen']);

            } catch (err) {
                addLog('ERROR', 'EmailService', `Error en UID ${id}: ${err.message}`);
            }
        }
    } catch (err) {
        addLog('ERROR', 'EmailService', `Error IMAP: ${err.message}`);
    } finally {
        if (connection) connection.end();
    }
}

module.exports = { processUnreadEmails };
