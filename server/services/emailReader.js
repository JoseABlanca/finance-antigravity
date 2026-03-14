const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
const { GoogleGenAI, Type } = require('@google/genai');
const db = require('../db');

// Corrected initialization: pass object with apiKey, not just the string
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getSettings() {
    try {
        const rows = db.prepare('SELECT * FROM app_settings').all();
        return rows.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
    } catch (err) {
        console.error('[EmailService] Error fetching settings:', err.message);
        return {};
    }
}

async function processUnreadEmails() {
    const settings = await getSettings();
    const imapUser = settings.IMAP_USER || process.env.IMAP_USER;
    const imapPass = settings.IMAP_PASSWORD || process.env.IMAP_PASSWORD;

    if (!imapUser || !imapPass) {
        console.log('[EmailService] Saltando lectura de emails: Credenciales IMAP no configuradas (ni en DB ni en .env)');
        return;
    }
    if (!process.env.GEMINI_API_KEY) {
        console.log('[EmailService] Saltando lectura de emails: GEMINI_API_KEY no configurada');
        return;
    }

    const config = {
        imap: {
            user: imapUser,
            password: imapPass,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 3000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    console.log(`[EmailService] Conectando a ${imapUser}...`);
    let connection;
    
    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        // Search emails from last 2 days (not just UNSEEN, so we catch emails opened in Gmail)
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 2);
        const searchCriteria = [['SINCE', sinceDate]];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`[EmailService] Encontrados ${messages.length} correos en los últimos 2 días.`);

        for (const item of messages) {
            const all = item.parts.find(p => p.which === '');
            const id = item.attributes.uid;
            const idHeader = "Imap-Id: " + id + "\r\n";
            
            try {
                const parsedMail = await simpleParser(idHeader + all.body);
                const senderAddress = parsedMail.from?.value?.[0]?.address || parsedMail.from?.text || 'Desconocido';
                const receivedAt = parsedMail.date ? parsedMail.date.toISOString() : new Date().toISOString();
                const subject = parsedMail.subject || '(Sin asunto)';

                // DEDUPLICATION: Check if this email was already processed
                const existing = db.prepare('SELECT id FROM email_alerts WHERE sender = ? AND subject = ? AND received_at = ?').get(senderAddress, subject, receivedAt);
                if (existing) {
                    console.log(`[EmailService] Saltando correo UID ${id}: Ya procesado previamente (ID Alerta: ${existing.id})`);
                    continue;
                }

                console.log(`[EmailService] Procesando correo UID ${id}: "${subject}"`);
                
                let emailText = parsedMail.text || parsedMail.textAsHtml || '';
                if (emailText.length > 3000) emailText = emailText.substring(0, 3000);
                
                let imagePart = null;
                const attachments = parsedMail.attachments || [];
                for (const att of attachments) {
                    if (att.contentType.startsWith('image/') || att.contentType === 'application/pdf') {
                        imagePart = {
                            inlineData: {
                                data: att.content.toString("base64"),
                                mimeType: att.contentType
                            }
                        };
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

                const promptText = `Analiza este correo y determina si es una factura o justificante de pago:
                Subject: ${parsedMail.subject}
                Body: ${emailText}`;

                const contents = [{ role: 'user', parts: [{ text: promptText }] }];
                if (imagePart) {
                    contents[0].parts.push(imagePart);
                }

                // Use new API syntax: genAI.models.generateContent
                const response = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: contents,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    }
                });

                const data = JSON.parse(response.text);

                if (data.is_invoice_or_receipt) {
                    console.log(`[EmailService] Factura/justificante detectado: ${data.vendor} - ${data.amount}€`);
                    
                    let journalEntryId = null;

                    // Only create accounting entry if amount > 0
                    if (data.amount > 0) {
                        const conceptHeader = `Auto: ${data.vendor} - ${data.concept}`;
                        const MAIN_BANK_ACCOUNT = 1;
                        const EXPENSE_ACCOUNT = 33;
                        const INCOME_ACCOUNT = 34;

                        try {
                            const entryResult = db.prepare(`INSERT INTO journal_entries (date, comment) VALUES (?, ?)`).run(data.date, conceptHeader);
                            journalEntryId = entryResult.lastInsertRowid;
                            const insertLine = db.prepare(`INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?)`);

                            if (data.is_expense) {
                                insertLine.run(journalEntryId, EXPENSE_ACCOUNT, data.amount, 0);
                                insertLine.run(journalEntryId, MAIN_BANK_ACCOUNT, 0, data.amount);
                            } else {
                                insertLine.run(journalEntryId, MAIN_BANK_ACCOUNT, data.amount, 0);
                                insertLine.run(journalEntryId, INCOME_ACCOUNT, 0, data.amount);
                            }
                            console.log(`[EmailService] Asiento Contable #${journalEntryId} creado.`);
                        } catch (dbErr) {
                            console.error('[EmailService] Error creating journal entry:', dbErr.message);
                        }
                    }

                    // Save alert to email_alerts table
                    try {
                        db.prepare(`
                            INSERT INTO email_alerts (received_at, sender, subject, vendor, amount, is_expense, journal_entry_id, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 'unread')
                        `).run(
                            receivedAt,
                            senderAddress,
                            subject,
                            data.vendor || 'Desconocido',
                            data.amount || 0,
                            data.is_expense ? 1 : 0,
                            journalEntryId
                        );
                        console.log(`[EmailService] Alerta guardada para: ${senderAddress}`);
                    } catch (alertErr) {
                        console.error('[EmailService] Error saving alert (tabla puede no existir aún):', alertErr.message);
                    }
                }
                
                // Mark email as seen in IMAP
                await connection.addFlags(id, ['\\Seen']);

            } catch (err) {
                console.error(`[EmailService] Error UID ${id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[EmailService] Connection Error:', err.message);
    } finally {
        if (connection) connection.end();
    }
}

module.exports = { processUnreadEmails };
