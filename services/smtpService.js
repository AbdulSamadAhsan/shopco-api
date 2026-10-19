const nodemailer = require('nodemailer');
function configuration() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || /[\r\n]/.test(EMAIL_FROM)) return null;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  return { from: EMAIL_FROM, transport: { host: SMTP_HOST, port, secure, requireTLS: !secure, auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000, tls: { rejectUnauthorized: true } } };
}
async function send(message) {
  const config = configuration();
  if (!config) throw Object.assign(new Error('SMTP is not configured'), { code: 'SMTP_NOT_CONFIGURED' });
  const transport = nodemailer.createTransport(config.transport);
  try {
    const domain = config.from.match(/@([^\s>]+)/)?.[1] || 'shopco.local';
    const result = await transport.sendMail({ ...message, from: config.from, ...(message.orderId ? { messageId: `<order-confirmation.${message.orderId}@${domain}>` } : {}) });
    if (!result.accepted?.length) throw Object.assign(new Error('SMTP did not accept the recipient'), { code: 'SMTP_RECIPIENT_REJECTED' });
  } finally { transport.close(); }
}
module.exports = { configuration, send };
