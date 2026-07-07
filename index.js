// Entry point: local polling or webhook hint for Vercel.
// NOTE: Vercel serverless — no in-memory sessions (Redis required).

import dotenv from 'dotenv';
dotenv.config({ override: true });
import { BOT_MODE } from './config.js';
import { bot } from './bot.js';

if (BOT_MODE === 'polling') {
  bot.launch({ dropPendingUpdates: true }, async () => {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Записаться на услугу' },
      { command: 'my_bookings', description: 'Мои записи и отмена' },
      { command: 'settings', description: 'Настройки и вход для мастера' },
    ]);
    console.log('[Bot] Running in polling mode (Redis sessions) 🚀');
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log('[Bot] Use Vercel webhook at api/webhook.js');
}
