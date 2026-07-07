// Shared command handlers — work inside scenes and outside scenes.

import { Markup } from 'telegraf';
import { SCENES, MASTERS, findMasterBySecret, ADMIN_SECRET_CODE } from '../config.js';
import { resetBooking, replySettingsMenu } from '../scenes/helpers.js';

function tryMasterLogin(code) {
  const normalized = String(code || '').trim();
  if (!normalized) return null;
  if (ADMIN_SECRET_CODE && normalized === ADMIN_SECRET_CODE) return MASTERS[0];
  return findMasterBySecret(normalized);
}

async function enterMasterCabinet(ctx, master) {
  ctx.session.role = 'master';
  ctx.session.masterId = master.id;
  await ctx.scene.leave().catch(() => {});
  await ctx.reply('Открываю кабинет мастера...', Markup.removeKeyboard());
  return ctx.scene.enter(SCENES.MASTER_MENU);
}

export async function handleStart(ctx) {
  const payload = ctx.startPayload || ctx.message?.text?.replace(/^\/start(@\w+)?\s*/, '').trim();
  const master = tryMasterLogin(payload);

  await ctx.scene.leave().catch(() => {});

  if (master) {
    await ctx.reply(`Добро пожаловать, ${master.name}!`);
    return enterMasterCabinet(ctx, master);
  }

  resetBooking(ctx);
  ctx.session.assistantMode = false;
  ctx.session.assistantHistory = [];
  await ctx.reply(
    'Добро пожаловать в парикмахерскую «Ножницы и Ко»! ✂️\n\n' +
      'Помогу записаться на услугу за пару минут.\n' +
      'Сначала выберите мастера — если есть вопрос, просто напишите его в чат.',
    Markup.removeKeyboard()
  );
  return ctx.scene.enter(SCENES.SELECT_MASTER);
}

export async function handleSettings(ctx) {
  return replySettingsMenu(ctx);
}

export async function handleAssistant(ctx) {
  await ctx.scene.leave().catch(() => {});
  resetBooking(ctx);
  ctx.session.assistantMode = true;
  ctx.session.assistantHistory = [];
  await ctx.reply(
    'Режим ассистента включён. Можешь свободно спрашивать про салон, услуги и цены. Для выхода — /start',
    Markup.removeKeyboard()
  );
}

export async function handleMasterLogin(ctx, master) {
  return enterMasterCabinet(ctx, master);
}

export function masterLoginKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔐 Вход для мастера', 'master_login')]]);
}
