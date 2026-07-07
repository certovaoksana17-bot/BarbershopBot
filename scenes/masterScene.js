// Master personal cabinet: schedule, vacation, today's bookings.

import { Scenes, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { SCENES, findMasterById } from '../config.js';
import {
  getMasterSchedule,
  getTodayBookings,
  markVacation,
  SheetsError,
} from '../services/bookingService.js';
import { parseVacationDates } from '../services/groq.js';
import { registerGlobalCommands } from './helpers.js';

const VACATION_HINT =
  'Укажите выходной датой или фразой.\n\n' +
  'Примеры:\n' +
  '• 2026-07-15\n' +
  '• выходной с 1 июня по 3 июня\n' +
  '• завтра и послезавтра\n' +
  '• в этот четверг\n\n' +
  'Отмена — слово «отмена».';

export const masterMenuScene = new Scenes.BaseScene(SCENES.MASTER_MENU);
registerGlobalCommands(masterMenuScene);

const masterMenuKeyboard = Markup.keyboard([
  ['📅 Моё расписание', '🏖 Отметить выходной'],
  ['📋 Записи на сегодня', '🚪 Выйти'],
]).resize();

masterMenuScene.enter(async (ctx) => {
  const master = findMasterById(ctx.session.masterId);
  await ctx.reply(`Кабинет мастера: ${master?.name || 'Мастер'}`, masterMenuKeyboard);
});

masterMenuScene.hears('📅 Моё расписание', async (ctx) => {
  const master = findMasterById(ctx.session.masterId);
  if (!master) return ctx.reply('Сессия мастера не найдена. Введите код доступа заново.');

  await ctx.reply('Загружаю расписание...');
  try {
    const schedule = await getMasterSchedule(master.name);
    if (!schedule.length) {
      return ctx.reply('Расписание пусто или лист мастера не настроен в Google Sheets.');
    }

    const lines = schedule.map((row) => {
      const slots = row.slots
        .map((s) => `  ${s.time}: ${s.status || 'свободно'}`)
        .join('\n');
      return `📆 ${row.date}\n${slots}`;
    });

    await ctx.reply(lines.join('\n\n').slice(0, 4000));
  } catch (err) {
    console.error('[Master] schedule error:', err.message);
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось загрузить расписание.');
  }
});

masterMenuScene.hears('🏖 Отметить выходной', async (ctx) => {
  await ctx.reply(VACATION_HINT);
  return ctx.scene.enter(SCENES.MASTER_VACATION_DATE);
});

masterMenuScene.hears('📋 Записи на сегодня', async (ctx) => {
  const master = findMasterById(ctx.session.masterId);
  if (!master) return ctx.reply('Сессия мастера не найдена.');

  await ctx.reply('Загружаю записи...');
  try {
    const bookings = await getTodayBookings(master.name);
    if (!bookings.length) {
      return ctx.reply('На сегодня записей нет.');
    }

    const text = bookings
      .map((b, i) => `${i + 1}. ${b.time} — ${b.name} ${b.surname}, ${b.service}, ${b.phone}`)
      .join('\n');
    await ctx.reply(`Записи на сегодня:\n\n${text}`);
  } catch (err) {
    console.error('[Master] today bookings error:', err.message);
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось загрузить записи.');
  }
});

masterMenuScene.hears('🚪 Выйти', async (ctx) => {
  ctx.session.role = 'client';
  ctx.session.masterId = null;
  await ctx.reply('Вы вышли из кабинета мастера. Для записи — /start');
  return ctx.scene.leave();
});

// --- MASTER_VACATION_DATE ---
export const masterVacationScene = new Scenes.BaseScene(SCENES.MASTER_VACATION_DATE);
registerGlobalCommands(masterVacationScene);

masterVacationScene.enter(async (ctx) => {
  await ctx.reply(VACATION_HINT);
});

async function applyVacationDates(ctx, dates) {
  const master = findMasterById(ctx.session.masterId);
  if (!master) {
    await ctx.reply('Сессия мастера не найдена.');
    return ctx.scene.enter(SCENES.MASTER_MENU);
  }

  const marked = [];
  const failed = [];

  for (const date of dates) {
    try {
      await markVacation(master.name, date);
      marked.push(date);
    } catch (err) {
      console.error('[Master] vacation error:', date, err.message);
      failed.push({ date, message: err instanceof SheetsError ? err.message : 'ошибка' });
    }
  }

  if (!marked.length) {
    const reason = failed[0]?.message || 'Не удалось отметить выходной.';
    await ctx.reply(reason, masterMenuKeyboard);
    return ctx.scene.enter(SCENES.MASTER_MENU);
  }

  const markedText = marked.map((d) => `• ${d}`).join('\n');
  let reply = `Выходной отмечен:\n${markedText}`;
  if (failed.length) {
    const failedText = failed.map((f) => `• ${f.date}: ${f.message}`).join('\n');
    reply += `\n\nНе удалось отметить:\n${failedText}`;
  }
  await ctx.reply(reply, masterMenuKeyboard);
  return ctx.scene.enter(SCENES.MASTER_MENU);
}

masterVacationScene.on(message('text'), async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return next();

  await ctx.sendChatAction('typing');
  const parsed = await parseVacationDates(text);

  if (parsed.cancel) {
    await ctx.reply('Отменено.', masterMenuKeyboard);
    return ctx.scene.enter(SCENES.MASTER_MENU);
  }
  if (!parsed.ok) {
    return ctx.reply(`${parsed.error}\n\n${VACATION_HINT}`);
  }

  return applyVacationDates(ctx, parsed.dates);
});

export const masterScenes = [masterMenuScene, masterVacationScene];
