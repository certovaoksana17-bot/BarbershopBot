// Central configuration: env vars, services, masters with secret codes and chat IDs.
// override: true — .env wins over stale shell vars like BOT_TOKEN=test

import dotenv from 'dotenv';
dotenv.config({ override: true });

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const GROQ_API_KEY = process.env.GROQ_API_KEY;
export const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
export const SHEETS_WEB_APP_URL = process.env.SHEETS_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEBHOOK_URL;
export const REDIS_URL = process.env.REDIS_URL;
export const ADMIN_SECRET_CODE = process.env.ADMIN_SECRET_CODE;

export const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/api/webhook';
export const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || process.env.VERCEL_URL;
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
export const BOT_MODE = process.env.BOT_MODE || 'webhook';
export const BOOKING_UTC_OFFSET = Number(process.env.BOOKING_UTC_OFFSET ?? 5);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is not set');
if (!REDIS_URL) throw new Error('REDIS_URL is not set — Vercel serverless requires Redis sessions');

export function getWebhookUrl() {
  if (!WEBHOOK_DOMAIN) throw new Error('WEBHOOK_DOMAIN is not set');
  const domain = WEBHOOK_DOMAIN.replace(/^https?:\/\//, '');
  return `https://${domain}${WEBHOOK_PATH}`;
}

// FSM scene ids
export const SCENES = {
  SELECT_SERVICE: 'SELECT_SERVICE',
  GET_NAME: 'GET_NAME',
  GET_SURNAME: 'GET_SURNAME',
  GET_PHONE: 'GET_PHONE',
  SELECT_MASTER: 'SELECT_MASTER',
  SHOW_SLOTS: 'SHOW_SLOTS',
  CONFIRM_BOOKING: 'CONFIRM_BOOKING',
  MASTER_MENU: 'MASTER_MENU',
  MASTER_VACATION_DATE: 'MASTER_VACATION_DATE',
};

export const SERVICES = [
  { id: 'haircut_m', name: 'Мужская стрижка', price: 1200 },
  { id: 'haircut_f', name: 'Женская стрижка', price: 1800 },
  { id: 'coloring', name: 'Окрашивание', price: 3500 },
  { id: 'beard', name: 'Моделирование бороды', price: 800 },
  { id: 'styling', name: 'Укладка', price: 1000 },
];

// Masters: secret code for login, chatId for notifications, sheetName for personal grid.
export const MASTERS = [
  {
    id: 'anna',
    name: 'Анна',
    sheetName: 'Мастер_Анна',
    secretCode: process.env.MASTER_ANNA_CODE || 'anna2024',
    chatId: String(process.env.MASTER_ANNA_CHAT_ID || '').trim(),
  },
  {
    id: 'ivan',
    name: 'Иван',
    sheetName: 'Мастер_Иван',
    secretCode: process.env.MASTER_IVAN_CODE || 'ivan2024',
    chatId: String(process.env.MASTER_IVAN_CHAT_ID || '').trim(),
  },
  {
    id: 'oksana',
    name: 'Оксана',
    sheetName: 'Мастер_Оксана',
    secretCode: process.env.MASTER_OKSANA_CODE || 'oksana2024',
    chatId: String(process.env.MASTER_OKSANA_CHAT_ID || '').trim(),
  },
];

export function findMasterBySecret(code) {
  const normalized = String(code).trim();
  return MASTERS.find((m) => m.secretCode === normalized) || null;
}

export function findMasterByName(name) {
  return MASTERS.find((m) => m.name === name) || null;
}

export function findMasterById(id) {
  return MASTERS.find((m) => m.id === id) || null;
}
