// Bot setup: Telegraf + Redis session store + scene stage.
// NOTE: Vercel serverless — no in-memory sessions.

import { Telegraf, session, Markup } from 'telegraf';
import { Redis } from '@telegraf/session/redis';
import { createClient } from 'redis';
import { message } from 'telegraf/filters';
import { BOT_TOKEN, REDIS_URL, MASTERS, ADMIN_SECRET_CODE, SCENES } from './config.js';
import { stage } from './scenes/index.js';
import { askGroq } from './services/groq.js';
import { resetBooking } from './scenes/helpers.js';
import { handleStart, handleSettings, handleMasterLogin } from './handlers/commands.js';

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
    defaultSession: () => ({ booking: {}, role: 'client', masterId: null }),
  })
);
bot.use(stage.middleware());

bot.start(handleStart);
bot.command('settings', handleSettings);

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
  const answer = await askGroq(ctx.message.text);
  await ctx.reply(`🤖 ${answer}`);
  await ctx.reply(
    'Хотите записаться?',
    Markup.inlineKeyboard([[Markup.button.callback('📝 Записаться', 'start_booking')]])
  );
});

bot.action('start_booking', async (ctx) => {
  await ctx.answerCbQuery();
  resetBooking(ctx);
  return ctx.scene.enter(SCENES.SELECT_SERVICE);
});

bot.catch((err, ctx) => {
  console.error(`[Bot] Error update ${ctx.update?.update_id}:`, err);
  if (process.env.BOT_MODE !== 'polling') throw err;
});
