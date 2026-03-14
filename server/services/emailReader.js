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

                const responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        is_invoice_or_receipt: { type: Type.BOOLEAN },
                        date: { type: Type.STRING },
                        amount: { type: Type.NUMBER },
                        concept: { type: Type.STRING },
                        is_expense: { type: Type.BOOLEAN },
                        vendor: { type: Type.STRING }
                    },
                    required: ["is_invoice_or_receipt", "date", "amount", "concept", "is_expense", "vendor"]
                };

                const promptText = `Analiza este correo y cualquier adjunto para determinar si es una factura o justificante de pago.
                Subject: ${subject}
                Body: ${emailText}`;

                const model = genAI.getGenerativeModel({ 
                    model: 'gemini-2.0-flash',
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    }
                });

                const contents = [ { text: promptText } ];
                if (attachmentPart) contents.push(attachmentPart);

                const result = await model.generateContent(contents);
                const data = JSON.parse(result.response.text());

                if (data.is_invoice_or_receipt) {
                    addLog('INFO', 'EmailService', `Factura detectada: ${data.vendor} - ${data.amount}€`);
                    
                    let journalEntryId = null;
                    if (data.amount > 0) {
                        try {
                            const entryResult = db.prepare(`INSERT INTO journal_entries (date, comment) VALUES (?, ?)`).run(data.date, `Auto: ${data.vendor} - ${data.concept}`);
                            journalEntryId = entryResult.lastInsertRowid;
                            const insertLine = db.prepare(`INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?)`);
                            const MAIN_BANK = 1;
                            if (data.is_expense) {
                                insertLine.run(journalEntryId, 33, data.amount, 0);
                                insertLine.run(journalEntryId, MAIN_BANK, 0, data.amount);
                            } else {
                                insertLine.run(journalEntryId, MAIN_BANK, data.amount, 0);
                                insertLine.run(journalEntryId, 34, 0, data.amount);
                            }
                        } catch (dbErr) {
                            addLog('ERROR', 'EmailService', `Error DB: ${dbErr.message}`);
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
