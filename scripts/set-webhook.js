import dotenv from 'dotenv';
dotenv.config({ override: true });
import { BOT_TOKEN, getWebhookUrl, WEBHOOK_SECRET } from '../config.js';

const action = process.argv[2] || 'set';
const apiBase = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function setWebhook() {
  const body = { url: getWebhookUrl() };
  if (WEBHOOK_SECRET) body.secret_token = WEBHOOK_SECRET;
  const res = await fetch(`${apiBase}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description);
  console.log('[Webhook] Registered:', body.url);
}

async function deleteWebhook() {
  const res = await fetch(`${apiBase}/deleteWebhook`, { method: 'POST' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description);
  console.log('[Webhook] Deleted');
}

try {
  if (action === 'delete') await deleteWebhook();
  else await setWebhook();
} catch (err) {
  console.error('[Webhook] Error:', err.message);
  process.exit(1);
}
