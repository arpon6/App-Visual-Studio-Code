export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY || process.env.VITE_BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.VITE_BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || process.env.VITE_BREVO_SENDER_NAME || 'Mi Club';

  console.log('send-brevo-email called', {
    hasApiKey: Boolean(apiKey),
    senderEmail: Boolean(senderEmail),
    senderName,
  });

  if (!apiKey || !senderEmail) {
    return res.status(500).json({ error: 'Brevo credentials not configured on the server.' });
  }

  const { to, subject, htmlContent, textContent } = req.body || {};
  if (!Array.isArray(to) || to.length === 0 || !subject || !textContent) {
    return res.status(400).json({ error: 'Missing required email payload.' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: to.map((email: string) => ({ email })),
        subject,
        htmlContent,
        textContent,
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({ error: body });
    }

    return res.status(200).json({ ok: true, body });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
