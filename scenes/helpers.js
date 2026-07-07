// Shared scene helpers: restart, AI fallback, session reset.

import { Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { SCENES } from '../config.js';
import { handleStart, handleSettings } from '../handlers/commands.js';
import { askGroq } from '../services/groq.js';
import { looksLikeQuestion } from '../utils/validation.js';

export const RESTART_TEXT = '🔄 Начать заново';

export const restartKeyboard = Markup.keyboard([[RESTART_TEXT]]).resize();

export function registerGlobalCommands(scene) {
  scene.command('start', handleStart);
  scene.command('settings', handleSettings);
}

export function resetBooking(ctx) {
  ctx.session.booking = {};
  ctx.session.role = 'client';
}

export function registerRestart(scene) {
  const restart = async (ctx) => {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    resetBooking(ctx);
    await ctx.reply('Хорошо, начнём запись сначала! 🔄');
    return ctx.scene.enter(SCENES.SELECT_SERVICE);
  };
  scene.hears(RESTART_TEXT, restart);
  scene.command('reset', restart);
  scene.action('restart', restart);
}

export function registerAiFallback(scene) {
  scene.on(message('text'), async (ctx, next) => {
    const text = ctx.message.text || '';
    if (ctx.message.entities?.some((e) => e.type === 'bot_command')) return next();
    if (text.startsWith('/')) return next();
    await ctx.sendChatAction('typing');
    const { intent, reply } = await askGroq(ctx.message.text);
    if (intent === 'CANCEL') {
      resetBooking(ctx);
      await ctx.scene.leave().catch(() => {});
      await ctx.reply(reply);
      return;
    }
    await ctx.reply(`🤖 ${reply}`);
    return ctx.scene.reenter();
  });
}

export async function replySettingsMenu(ctx) {
  await ctx.scene.leave().catch(() => {});
  await ctx.reply(
    'Настройки:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📝 Новая запись', 'start_booking')],
      [Markup.button.callback('🔐 Вход для мастера', 'master_login')],
    ])
  );
}

export async function answerWithAi(ctx, resumeHint) {
  await ctx.sendChatAction('typing');
  const { intent, reply } = await askGroq(ctx.message.text);
  if (intent === 'CANCEL') {
    resetBooking(ctx);
    await ctx.scene.leave().catch(() => {});
    await ctx.reply(reply);
    return;
  }
  await ctx.reply(`🤖 ${reply}`);
  await ctx.reply(`Продолжим запись. ${resumeHint}`, restartKeyboard);
}

export { looksLikeQuestion };
