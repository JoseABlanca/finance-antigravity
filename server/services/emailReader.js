const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
const { GoogleGenAI, Type } = require('@google/genai');
const db = require('../db');

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

        // Search for UNREAD emails
        const searchCriteria = ['UNREAD'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`[EmailService] Encontrados ${messages.length} correos no leídos.`);

        for (const item of messages) {
            const all = item.parts.find(p => p.which === '');
            const id = item.attributes.uid;
            const idHeader = "Imap-Id: " + id + "\r\n";
            
            try {
                const parsedMail = await simpleParser(idHeader + all.body);
                console.log(`[EmailService] Procesando correo UID ${id}: "${parsedMail.subject}"`);
                
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

                const prompt = `Analiza este correo:
                Subject: ${parsedMail.subject}
                Body: ${emailText}`;

                const contents = [prompt];
                if (imagePart) contents.push(imagePart);

                const response = await ai.getGenerativeModel({ model: 'gemini-1.5-flash' }).generateContent({
                    contents: contents,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    }
                });

                const data = JSON.parse(response.response.text());

                if (data.is_invoice_or_receipt && data.amount > 0) {
                    const conceptHeader = `Auto: ${data.vendor} - ${data.concept}`;
                    const MAIN_BANK_ACCOUNT = 1;
                    const EXPENSE_ACCOUNT = 33;
                    const INCOME_ACCOUNT = 34;

                    const entryResult = db.prepare(`INSERT INTO journal_entries (date, comment) VALUES (?, ?)`).run(data.date, conceptHeader);
                    const entryId = entryResult.lastInsertRowid;
                    const insertLine = db.prepare(`INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?)`);

                    if (data.is_expense) {
                        insertLine.run(entryId, EXPENSE_ACCOUNT, data.amount, 0);
                        insertLine.run(entryId, MAIN_BANK_ACCOUNT, 0, data.amount);
                    } else {
                        insertLine.run(entryId, MAIN_BANK_ACCOUNT, data.amount, 0);
                        insertLine.run(entryId, INCOME_ACCOUNT, 0, data.amount);
                    }
                    console.log(`[EmailService] Asiento Contable #${entryId} creado.`);
                }
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
