import { Markup } from 'telegraf';
import { MASTERS, SCENES } from '../config.js';
import { getAllServicesUnion } from './catalogService.js';
import { logAssistantEvent } from './bookingService.js';
import { notifyAdminAboutError } from './notificationService.js';

const ASSISTANT_BUTTONS = [
  [Markup.button.callback('💸 Цены', 'assistant_prompt:prices')],
  [Markup.button.callback('❓ Как записаться', 'assistant_prompt:howto')],
  [Markup.button.callback('📅 Мои записи', 'assistant_my_bookings')],
  [Markup.button.callback('📝 Записаться', 'start_booking')],
];

const PROMPT_MESSAGES = {
  prices: 'Какие услуги есть в салоне и сколько они стоят?',
  howto: 'Как записаться через бота?',
};

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWholePhrase(text, phrase) {
  if (!phrase) return false;
  const pattern = new RegExp(`(^|[^a-zа-яё])${escapeRegex(phrase)}([^a-zа-яё]|$)`, 'i');
  return pattern.test(text);
}

function buildMasterNameVariants(name) {
  const normalized = normalize(name);
  if (!normalized) return [];
  const base = normalized.endsWith('а') ? normalized.slice(0, -1) : normalized;
  return [normalized, `${base}е`, `${base}у`, `${base}ой`, `${base}у`];
}

function getServiceAliases(name) {
  const normalized = normalize(name);
  const aliases = [normalized];
  if (normalized.includes('мужская стрижка')) aliases.push('мужскую стрижку', 'мужская', 'стрижка');
  if (normalized.includes('женская стрижка')) aliases.push('женскую стрижку', 'женская');
  if (normalized.includes('окрашивание')) aliases.push('окрашивание', 'покраска');
  if (normalized.includes('моделирование бороды')) aliases.push('бороду', 'борода');
  if (normalized.includes('укладка')) aliases.push('укладку', 'прическу', 'причёску');
  return aliases;
}

function resetBookingState(ctx) {
  ctx.session.booking = {};
  ctx.session.role = 'client';
}

export function getAssistantQuickKeyboard() {
  return Markup.inlineKeyboard(ASSISTANT_BUTTONS);
}

export function getAssistantPromptMessage(key) {
  return PROMPT_MESSAGES[key] || null;
}

export async function detectBookingIntent(userMessage) {
  const text = normalize(userMessage);
  if (/как\s+запис/.test(text)) return null;
  const wantsBooking = /(запиш|записать|записаться|бронь|заброни|хочу.*(стриж|окраш|бород|уклад)|можно.*(на|к).*(стриж|окраш|бород|уклад)|нужн.*(стриж|окраш|бород|уклад))/.test(text);
  if (!wantsBooking) return null;

  const services = await getAllServicesUnion().catch(() => []);
  const master =
    MASTERS.find((item) => buildMasterNameVariants(item.name).some((variant) => containsWholePhrase(text, variant))) || null;
  const service =
    services.find((item) => {
      return getServiceAliases(item.name).some((alias) => alias && text.includes(alias));
    }) || null;

  return {
    wantsBooking: true,
    master,
    service,
  };
}

export async function startBookingFromIntent(ctx, intent) {
  resetBookingState(ctx);
  ctx.session.assistantMode = false;
  ctx.session.assistantHistory = [];
  ctx.session.booking = ctx.session.booking || {};

  if (intent?.master) {
    ctx.session.booking.masterId = intent.master.id;
    ctx.session.booking.masterName = intent.master.name;
  }

  if (intent?.service) {
    ctx.session.booking.serviceId = intent.service.id;
    ctx.session.booking.service = intent.service.name;
    ctx.session.booking.price = intent.service.price;
  }

  if (intent?.master) {
    if (intent?.service) {
      await ctx.reply(
        `Начинаем запись: ${intent.master.name}, ${intent.service.name} — ${intent.service.price} ₽.`
      );
    } else {
      await ctx.reply(`Начинаем запись к мастеру ${intent.master.name}. Теперь выбери услугу.`);
    }
    return ctx.scene.enter(SCENES.SELECT_SERVICE);
  }

  if (intent?.service) {
    await ctx.reply(`Начинаем запись на услугу «${intent.service.name}». Сначала выбери мастера.`);
  } else {
    await ctx.reply('Открываю запись. Сначала выбери мастера.');
  }
  return ctx.scene.enter(SCENES.SELECT_MASTER);
}

export async function logAssistantEventSafe(event, telegram = null) {
  try {
    await logAssistantEvent(event);
  } catch (err) {
    console.error('[Assistant] analytics error:', err.message);
    if (telegram) {
      await notifyAdminAboutError(
        { area: 'assistant_analytics', error: err.message, meta: event.eventType || 'unknown' },
        telegram
      );
    }
  }
}
