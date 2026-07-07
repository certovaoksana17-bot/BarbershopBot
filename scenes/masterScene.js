// Master personal cabinet: schedule, vacation, today's bookings.

import { Scenes, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { SCENES, findMasterById } from '../config.js';
import {
  getMasterSchedule,
  getTodayBookings,
  markVacation,
  getMasterServicesFromSheets,
  saveMasterService,
  deleteMasterService,
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
  ['📅 Моё расписание'],
  ['🏖 Отметить выходной'],
  ['💰 Мои услуги'],
  ['📋 Записи на сегодня'],
  ['🚪 Выйти'],
]).resize();

const masterMenuInline = Markup.inlineKeyboard([
  [Markup.button.callback('💰 Мои услуги', 'msvc_open')],
]);

async function exitMasterCabinet(ctx) {
  ctx.session.role = 'client';
  ctx.session.masterId = null;
  await ctx.scene.leave().catch(() => {});
  await ctx.reply('Вы вышли из кабинета мастера. Для записи — /start', Markup.removeKeyboard());
}

masterMenuScene.enter(async (ctx) => {
  const master = findMasterById(ctx.session.masterId);
  await ctx.reply(
    `Кабинет мастера: ${master?.name || 'Мастер'}\n\n` +
      'Меню:\n' +
      '• 📅 Моё расписание\n' +
      '• 🏖 Отметить выходной\n' +
      '• 💰 Мои услуги — цены и список услуг\n' +
      '• 📋 Записи на сегодня\n' +
      '• 🚪 Выйти',
    masterMenuKeyboard
  );
  await ctx.reply('Или нажмите кнопку ниже:', masterMenuInline);
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

masterMenuScene.hears('🚪 Выйти', exitMasterCabinet);

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

async function showMasterServices(ctx) {
  const master = findMasterById(ctx.session.masterId);
  if (!master) return ctx.reply('Сессия мастера не найдена.');

  try {
    const services = await getMasterServicesFromSheets(master.name);
    if (!services.length) {
      await ctx.reply('Услуг пока нет. Добавьте первую услугу.');
    } else {
      const lines = services.map((s) => `• ${s.name} — ${s.price} ₽`).join('\n');
      await ctx.reply(`Ваши услуги:\n\n${lines}`);
    }

    await ctx.reply(
      'Управление услугами:',
      Markup.inlineKeyboard([
        ...services.map((s) => [
          Markup.button.callback(`✏️ ${s.name}`, `msvc_edit:${s.id}`),
          Markup.button.callback('🗑', `msvc_del:${s.id}`),
        ]),
        [Markup.button.callback('➕ Добавить услугу', 'msvc_add')],
        [Markup.button.callback('◀️ В меню', 'msvc_back')],
      ])
    );
  } catch (err) {
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось загрузить услуги.');
  }
}

masterMenuScene.hears('💰 Мои услуги', async (ctx) => showMasterServices(ctx));

masterMenuScene.action('msvc_open', async (ctx) => {
  await ctx.answerCbQuery();
  return showMasterServices(ctx);
});

masterMenuScene.action('msvc_add', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.serviceDraft = { step: 'name' };
  await ctx.reply('Введите название новой услуги:');
  return ctx.scene.enter(SCENES.MASTER_SERVICE_EDIT);
});

masterMenuScene.action(/^msvc_edit:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const master = findMasterById(ctx.session.masterId);
  const services = await getMasterServicesFromSheets(master.name);
  const service = services.find((s) => s.id === ctx.match[1]);
  if (!service) return ctx.reply('Услуга не найдена.');
  ctx.session.serviceDraft = { step: 'price', serviceId: service.id, name: service.name };
  await ctx.reply(`Новая цена для «${service.name}» (в рублях):`);
  return ctx.scene.enter(SCENES.MASTER_SERVICE_EDIT);
});

masterMenuScene.action(/^msvc_del:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const master = findMasterById(ctx.session.masterId);
  try {
    await deleteMasterService({ masterName: master.name, serviceId: ctx.match[1] });
    await ctx.reply('Услуга удалена.');
    return showMasterServices(ctx);
  } catch (err) {
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось удалить услугу.');
  }
});

masterMenuScene.action('msvc_back', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENES.MASTER_MENU);
});

export const masterServiceEditScene = new Scenes.BaseScene(SCENES.MASTER_SERVICE_EDIT);
registerGlobalCommands(masterServiceEditScene);

masterServiceEditScene.on(message('text'), async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return next();
  const draft = ctx.session.serviceDraft || {};
  const master = findMasterById(ctx.session.masterId);
  if (!master) return ctx.reply('Сессия мастера не найдена.');

  if (draft.step === 'name') {
    if (text.length < 2) return ctx.reply('Название слишком короткое.');
    ctx.session.serviceDraft = { ...draft, step: 'price', name: text };
    return ctx.reply('Введите цену в рублях (только число):');
  }

  const price = Number(text.replace(/\s/g, ''));
  if (!Number.isFinite(price) || price <= 0) {
    return ctx.reply('Введите корректную цену, например: 1500');
  }

  try {
    await saveMasterService({
      masterName: master.name,
      serviceId: draft.serviceId,
      name: draft.name,
      price,
    });
    ctx.session.serviceDraft = null;
    await ctx.reply(`Сохранено: ${draft.name} — ${price} ₽`, masterMenuKeyboard);
    return ctx.scene.enter(SCENES.MASTER_MENU);
  } catch (err) {
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось сохранить услугу.');
  }
});

export const masterScenes = [
  masterMenuScene,
  masterVacationScene,
  masterServiceEditScene,
];
