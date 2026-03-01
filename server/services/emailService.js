const nodemailer = require('nodemailer');

// For dev, we might use Ethereal or just log.
// Since we don't have user creds, we'll setup a test account or just mock.
const sendEmail = async (to, subject, html) => {
    try {
        let transporter;
        let previewUrl = null;

        if (!process.env.SMTP_HOST) {
            try {
                // Generate test SMTP service account from ethereal.email
                const testAccount = await nodemailer.createTestAccount();

                // create reusable transporter object using the default SMTP transport
                transporter = nodemailer.createTransport({
                    host: "smtp.ethereal.email",
                    port: 587,
                    secure: false, // true for 465, false for other ports
                    auth: {
                        user: testAccount.user, // generated ethereal user
                        pass: testAccount.pass, // generated ethereal password
                    },
                });
                console.log("Using Ethereal Test Account:", testAccount.user);
            } catch (etherealErr) {
                console.warn("Failed to create Ethereal account, falling back to console log:", etherealErr.message);
                // Fallback to console log (Mock)
                console.log("---------------------------------------------------");
                console.log("MOCK EMAIL SENT (Fallback)");
                console.log(`To: ${to}`);
                console.log(`Subject: ${subject}`);
                console.log("---------------------------------------------------");
                return { message: 'Mock email sent (check console)', previewUrl: null };
            }
        } else {
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }

        const info = await transporter.sendMail({
            from: '"Finance App" <noreply@financeapp.local>',
            to,
            subject,
            html,
        });

        console.log("Message sent: %s", info.messageId);

        // Preview only available when sending through an Ethereal account
        if (!process.env.SMTP_HOST) {
            previewUrl = nodemailer.getTestMessageUrl(info);
            console.log("Preview URL: %s", previewUrl);
        }

        return { messageId: info.messageId, previewUrl };
    } catch (err) {
        console.error("Error sending email:", err);
        throw err;
    }
};

module.exports = { sendEmail };
