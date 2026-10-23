// One place to send email (Resend). Used by the enquiry form alert, the
// optional client acknowledgement and Team invites.
export const FROM = () => process.env.ENQUIRY_FROM || 'ORPI Events <hello@orpi.events>';
export const ALERT_TO = () => process.env.ENQUIRY_ALERT_TO || 'hello@orpi.events';
export const canEmail = () => !!process.env.RESEND_API_KEY;

export async function sendEmail({ to, subject, text, html, replyTo = 'hello@orpi.events' }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: Array.isArray(to) ? to : [to], subject, text, ...(html ? { html } : {}), reply_to: replyTo }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}
