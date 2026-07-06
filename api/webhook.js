// Vercel serverless webhook endpoint.

import { bot } from '../bot.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Barbershop bot webhook is running (Redis sessions)');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await bot.handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
