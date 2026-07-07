// Cron job: 24h reminders and auto-release unconfirmed slots.

import { Markup } from 'telegraf';
import { CRON_SECRET } from '../config.js';
import { bot, ensureRedisReady } from '../bot.js';
import {
  getReminderBookings,
  getUnconfirmedBookings,
  releaseBooking,
  markReminderSent,
} from '../services/bookingService.js';
import {
  notifyClientReminder,
  notifyClientReleased,
  notifyMasterAboutCancellation,
} from '../services/notificationService.js';

function isAuthorized(req) {
  if (!CRON_SECRET) return process.env.VERCEL === '1';
  const header = req.headers['authorization'];
  return header === `Bearer ${CRON_SECRET}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!CRON_SECRET) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await ensureRedisReady();
    const reminded = await processReminders();
    const released = await processAutoRelease();
    return res.status(200).json({ ok: true, reminded, released });
  } catch (err) {
    console.error('[Reminders] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

async function processReminders() {
  const bookings = await getReminderBookings();
  let count = 0;
  for (const booking of bookings) {
    const sent = await notifyClientReminder(booking, bot.telegram, Markup);
    if (sent) {
      await markReminderSent(booking.bookingId);
      count++;
    }
  }
  return count;
}

async function processAutoRelease() {
  const bookings = await getUnconfirmedBookings();
  let count = 0;
  for (const booking of bookings) {
    try {
      await releaseBooking(booking.bookingId);
      await notifyClientReleased(booking, bot.telegram);
      await notifyMasterAboutCancellation(
        { ...booking, label: booking.label },
        bot.telegram,
        'auto_release'
      );
      count++;
    } catch (err) {
      console.error('[Reminders] release failed:', booking.bookingId, err.message);
    }
  }
  return count;
}



