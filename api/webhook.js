// Vercel serverless webhook endpoint.

import { bot, ensureRedisReady } from '../bot.js';
import { WEBHOOK_SECRET } from '../config.js';

function isValidWebhookSecret(req) {
  if (!WEBHOOK_SECRET) return true;
  const header = req.headers['x-telegram-bot-api-secret-token'];
  return header === WEBHOOK_SECRET;
}

function parseUpdateBody(body) {
  if (!body) return null;
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Barbershop bot webhook is running (Redis sessions)');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isValidWebhookSecret(req)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  try {
    const update = parseUpdateBody(req.body);
    if (!update?.update_id) {
      console.error('[Webhook] Invalid update body:', typeof req.body);
      return res.status(400).json({ error: 'Invalid update body' });
    }

    await ensureRedisReady();
    await bot.handleUpdate(update);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
