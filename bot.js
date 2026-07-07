// Bot setup: Telegraf + Redis session store + scene stage.
// NOTE: Vercel serverless — no in-memory sessions.

import { Telegraf, session, Markup } from 'telegraf';
import { Redis } from '@telegraf/session/redis';
import { createClient } from 'redis';
import { message } from 'telegraf/filters';
import { BOT_TOKEN, REDIS_URL, MASTERS, ADMIN_SECRET_CODE, SCENES } from './config.js';
import { stage } from './scenes/index.js';
import { askGroq, askGroqAssistant } from './services/groq.js';
import { resetBooking } from './scenes/helpers.js';
import { handleAssistant, handleStart, handleSettings, handleMasterLogin } from './handlers/commands.js';
import { showClientBookings, handleBookingCancel, handleBookingConfirm } from './handlers/bookings.js';
import {
  detectBookingIntent,
  getAssistantPromptMessage,
  getAssistantQuickKeyboard,
  logAssistantEventSafe,
  startBookingFromIntent,
} from './services/assistantService.js';
import { notifyAdminAboutError } from './services/notificationService.js';

const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (err) => console.error('[Redis] Client error:', err.message));

const store = Redis({ client: redisClient });
let redisReadyPromise = null;

export async function ensureRedisReady() {
  if (redisClient.isOpen) return;
  if (!redisReadyPromise) {
    redisReadyPromise = redisClient.connect().catch((err) => {
      redisReadyPromise = null;
      throw err;
    });
  }
  await redisReadyPromise;
}

export const bot = new Telegraf(BOT_TOKEN);

bot.use(
  session({
    store,
    defaultSession: () => ({ booking: {}, role: 'client', masterId: null, assistantMode: false, assistantHistory: [] }),
  })
);
bot.use(stage.middleware());

bot.start(handleStart);
bot.command('assistant', handleAssistant);
bot.command('settings', handleSettings);
bot.command('my_bookings', showClientBookings);
bot.hears(/^\/assistant(@\w+)?$/i, handleAssistant);

bot.action(/^booking_confirm:(.+)$/, async (ctx) => handleBookingConfirm(ctx, ctx.match[1]));
bot.action(/^booking_cancel:(.+)$/, async (ctx) => handleBookingCancel(ctx, ctx.match[1]));
bot.action('assistant_my_bookings', async (ctx) => {
  await ctx.answerCbQuery();
  return showClientBookings(ctx);
});
bot.action(/^assistant_prompt:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const promptMessage = getAssistantPromptMessage(ctx.match[1]);
  if (!promptMessage) return ctx.reply('Подсказка больше недоступна.');
  const history = Array.isArray(ctx.session.assistantHistory) ? ctx.session.assistantHistory : [];
  const reply = await askGroqAssistant(history, promptMessage);
  ctx.session.assistantMode = true;
  ctx.session.assistantHistory = [
    ...history,
    { role: 'user', content: promptMessage },
    { role: 'assistant', content: reply },
  ].slice(-6);
  await logAssistantEventSafe({
    eventType: 'assistant_quick_prompt',
    userId: ctx.from?.id,
    language: /[A-Za-z]/.test(promptMessage) ? 'en' : 'ru',
    message: promptMessage,
    reply,
    intent: 'quick_prompt',
    result: 'answered',
    meta: { source: ctx.match[1] },
  }, ctx.telegram);
  await ctx.reply(`🤖 ${reply}`, getAssistantQuickKeyboard());
});

bot.action('master_login', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Введите секретный код мастера для входа в личный кабинет.');
});

for (const master of MASTERS) {
  bot.hears(master.secretCode, async (ctx) => handleMasterLogin(ctx, master));
}
if (ADMIN_SECRET_CODE) {
  bot.hears(ADMIN_SECRET_CODE, async (ctx) => handleMasterLogin(ctx, MASTERS[0]));
}

bot.on(message('text'), async (ctx, next) => {
  if (ctx.scene?.current) return next();
  if (ctx.message.entities?.some((e) => e.type === 'bot_command')) return next();
  await ctx.sendChatAction('typing');

  if (ctx.session.assistantMode) {
    const userMessage = ctx.message.text.trim();
    const history = Array.isArray(ctx.session.assistantHistory) ? ctx.session.assistantHistory : [];
    const bookingIntent = await detectBookingIntent(userMessage);
    if (bookingIntent?.wantsBooking) {
      await logAssistantEventSafe({
        eventType: 'assistant_booking_intent',
        userId: ctx.from?.id,
        language: /[A-Za-z]/.test(userMessage) ? 'en' : 'ru',
        message: userMessage,
        reply: '',
        intent: 'booking',
        result: bookingIntent.master || bookingIntent.service ? 'prefill' : 'start_booking',
        meta: {
          master: bookingIntent.master?.name || '',
          service: bookingIntent.service?.name || '',
        },
      }, ctx.telegram);
      return startBookingFromIntent(ctx, bookingIntent);
    }

    const reply = await askGroqAssistant(history, userMessage);
    const nextHistory = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: reply },
    ].slice(-6);
    ctx.session.assistantHistory = nextHistory;
    await logAssistantEventSafe({
      eventType: 'assistant_message',
      userId: ctx.from?.id,
      language: /[A-Za-z]/.test(userMessage) ? 'en' : 'ru',
      message: userMessage,
      reply,
      intent: 'assistant',
      result: 'answered',
      meta: {},
    }, ctx.telegram);
    await ctx.reply(`🤖 ${reply}`, getAssistantQuickKeyboard());
    return;
  }

  const { intent, reply } = await askGroq(ctx.message.text);
  if (intent === 'CANCEL') {
    resetBooking(ctx);
    await ctx.scene.leave().catch(() => {});
    await ctx.reply(reply);
    return;
  }
  await ctx.reply(`🤖 ${reply}`);
  await ctx.reply(
    'Хотите записаться?',
    Markup.inlineKeyboard([[Markup.button.callback('📝 Записаться', 'start_booking')]])
  );
});

bot.action('start_booking', async (ctx) => {
  await ctx.answerCbQuery();
  resetBooking(ctx);
  ctx.session.assistantMode = false;
  ctx.session.assistantHistory = [];
  return ctx.scene.enter(SCENES.SELECT_MASTER);
});

bot.catch((err, ctx) => {
  console.error(`[Bot] Error update ${ctx.update?.update_id}:`, err);
  notifyAdminAboutError(
    {
      area: 'bot_update',
      error: err.message,
      meta: `update:${ctx.update?.update_id || 'unknown'}`,
    },
    ctx.telegram
  ).catch(() => {});
  if (process.env.BOT_MODE !== 'polling') throw err;
});
