// Client FSM: SELECT_MASTER → SELECT_SERVICE → GET_NAME → GET_SURNAME → GET_PHONE → SHOW_SLOTS → CONFIRM_BOOKING

import { Scenes, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { SCENES, MASTERS } from '../config.js';
import { getMasterServices } from '../services/catalogService.js';
import {
  RESTART_TEXT,
  registerRestart,
  registerAiFallback,
  registerGlobalCommands,
  restartKeyboard,
  answerWithAi,
  looksLikeQuestion,
} from './helpers.js';
import {
  isValidName,
  getNameInputError,
  isValidPhone,
  formatPhoneInput,
  isSlotInPast,
} from '../utils/validation.js';
import { getAvailableSlots, sendBookingToSheets, isSlotAvailable, SheetsError } from '../services/bookingService.js';
import { notifyMasterAboutBooking } from '../services/notificationService.js';

// --- SELECT_MASTER ---
export const selectMasterScene = new Scenes.BaseScene(SCENES.SELECT_MASTER);
registerGlobalCommands(selectMasterScene);

selectMasterScene.enter(async (ctx) => {
  ctx.session.booking = ctx.session.booking || {};
  ctx.session.role = 'client';
  await ctx.reply('Выберите мастера 👇', restartKeyboard);
  await ctx.reply(
    'Наши мастера:',
    Markup.inlineKeyboard([
      ...MASTERS.map((m) => [Markup.button.callback(m.name, `master:${m.id}`)]),
      [Markup.button.callback('🔄 Начать заново', 'restart')],
    ])
  );
});

selectMasterScene.action(/^master:(.+)$/, async (ctx) => {
  const master = MASTERS.find((m) => m.id === ctx.match[1]);
  if (!master) return ctx.answerCbQuery('Мастер не найден');
  ctx.session.booking.masterId = master.id;
  ctx.session.booking.masterName = master.name;
  await ctx.answerCbQuery();
  await ctx.reply(`Мастер: ${master.name} ✂️`);
  return ctx.scene.enter(SCENES.SELECT_SERVICE);
});

registerRestart(selectMasterScene);
registerAiFallback(selectMasterScene);

// --- SELECT_SERVICE ---
export const selectServiceScene = new Scenes.BaseScene(SCENES.SELECT_SERVICE);
registerGlobalCommands(selectServiceScene);

selectServiceScene.enter(async (ctx) => {
  const masterName = ctx.session.booking?.masterName;
  if (!masterName) return ctx.scene.enter(SCENES.SELECT_MASTER);

  await ctx.reply('Загружаю услуги...');
  const services = await getMasterServices(masterName);
  ctx.session.masterServices = services;

  if (!services.length) {
    await ctx.reply('У этого мастера пока нет услуг. Выберите другого мастера.');
    return ctx.scene.enter(SCENES.SELECT_MASTER);
  }

  await ctx.reply('Выберите услугу 👇', restartKeyboard);
  await ctx.reply(
    `Услуги мастера ${masterName}:`,
    Markup.inlineKeyboard(
      services.map((s) => [Markup.button.callback(`${s.name} — ${s.price} ₽`, `service:${s.id}`)])
    )
  );
});

selectServiceScene.action(/^service:(.+)$/, async (ctx) => {
  const services = ctx.session.masterServices || [];
  const service = services.find((s) => s.id === ctx.match[1]);
  if (!service) return ctx.answerCbQuery('Услуга не найдена');
  ctx.session.booking.serviceId = service.id;
  ctx.session.booking.service = service.name;
  ctx.session.booking.price = service.price;
  await ctx.answerCbQuery();
  await ctx.reply(`Вы выбрали: ${service.name} — ${service.price} ₽ ✂️`);
  return ctx.scene.enter(SCENES.GET_NAME);
});

registerRestart(selectServiceScene);
registerAiFallback(selectServiceScene);

// --- GET_NAME ---
export const getNameScene = new Scenes.BaseScene(SCENES.GET_NAME);
registerGlobalCommands(getNameScene);

getNameScene.enter(async (ctx) => {
  await ctx.reply('Как вас зовут? ✍️', restartKeyboard);
});

registerRestart(getNameScene);

getNameScene.on(message('text'), async (ctx, next) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return next();
  if (looksLikeQuestion(text)) return answerWithAi(ctx, 'Напишите ваше имя:');
  const nameError = getNameInputError(text);
  if (nameError) return ctx.reply(nameError);
  ctx.session.booking.name = text.trim();
  return ctx.scene.enter(SCENES.GET_SURNAME);
});

getNameScene.on('message', (ctx) => ctx.reply('Пожалуйста, отправьте имя текстом.'));

// --- GET_SURNAME ---
export const getSurnameScene = new Scenes.BaseScene(SCENES.GET_SURNAME);
registerGlobalCommands(getSurnameScene);

getSurnameScene.enter(async (ctx) => {
  await ctx.reply(`Приятно познакомиться, ${ctx.session.booking.name}! Напишите фамилию ✍️`, restartKeyboard);
});

registerRestart(getSurnameScene);

getSurnameScene.on(message('text'), async (ctx, next) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return next();
  if (looksLikeQuestion(text)) return answerWithAi(ctx, 'Напишите вашу фамилию:');
  const surnameError = getNameInputError(text, 'фамилию');
  if (surnameError) return ctx.reply(surnameError);
  ctx.session.booking.surname = text.trim();
  return ctx.scene.enter(SCENES.GET_PHONE);
});

getSurnameScene.on('message', (ctx) => ctx.reply('Пожалуйста, отправьте фамилию текстом.'));

// --- GET_PHONE ---
export const getPhoneScene = new Scenes.BaseScene(SCENES.GET_PHONE);
registerGlobalCommands(getPhoneScene);

const phoneKeyboard = Markup.keyboard([
  [Markup.button.contactRequest('📱 Поделиться контактом')],
  [RESTART_TEXT],
]).resize();

getPhoneScene.enter(async (ctx) => {
  await ctx.reply('Укажите телефон в формате +7XXXXXXXXXX или нажмите «Поделиться контактом»:', phoneKeyboard);
});

registerRestart(getPhoneScene);

function savePhone(ctx, raw) {
  const phone = formatPhoneInput(raw);
  if (!isValidPhone(phone)) return false;
  ctx.session.booking.phone = phone;
  return true;
}

getPhoneScene.on(message('contact'), async (ctx) => {
  if (!savePhone(ctx, ctx.message.contact.phone_number)) {
    return ctx.reply('Не удалось распознать номер. Введите вручную: +79XXXXXXXXX');
  }
  return ctx.scene.enter(SCENES.SHOW_SLOTS);
});

getPhoneScene.on(message('text'), async (ctx, next) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return next();
  if (looksLikeQuestion(text)) return answerWithAi(ctx, 'Укажите номер телефона:');
  if (!savePhone(ctx, text)) {
    return ctx.reply('Неверный формат. Пример: +79991234567');
  }
  return ctx.scene.enter(SCENES.SHOW_SLOTS);
});

getPhoneScene.on('message', (ctx) => ctx.reply('Отправьте телефон текстом или через кнопку контакта.'));

// --- SHOW_SLOTS ---
export const showSlotsScene = new Scenes.BaseScene(SCENES.SHOW_SLOTS);
registerGlobalCommands(showSlotsScene);

showSlotsScene.enter(async (ctx) => {
  const { masterName } = ctx.session.booking;
  await ctx.reply('Загружаю свободные слоты...');

  try {
    const slots = await getAvailableSlots(masterName);
    ctx.session.availableSlots = slots;

    if (!slots.length) {
      await ctx.reply('Свободных слотов у этого мастера сейчас нет. Попробуйте позже или выберите другого мастера.');
      return ctx.scene.enter(SCENES.SELECT_MASTER);
    }

    await ctx.reply(
      'Выберите удобное время 🕐',
      Markup.inlineKeyboard([
        ...slots.map((slot, index) => [
          Markup.button.callback(slot.label, `slotidx:${index}`),
        ]),
        [Markup.button.callback('🔄 Начать заново', 'restart')],
      ])
    );
  } catch (err) {
    console.error('[SHOW_SLOTS] Sheets error:', err.message);
    const msg =
      err instanceof SheetsError
        ? err.message
        : 'Не удалось загрузить расписание. Попробуйте через минуту.';
    await ctx.reply(msg, restartKeyboard);
    // Session stays in Redis — user can retry without losing progress.
    return ctx.scene.enter(SCENES.SELECT_MASTER);
  }
});

showSlotsScene.action(/^slotidx:(\d+)$/, async (ctx) => {
  const index = Number(ctx.match[1]);
  const slots = ctx.session.availableSlots || [];
  const slot = slots[index];

  if (!slot) {
    await ctx.answerCbQuery('Этот слот уже недоступен');
    return ctx.scene.reenter();
  }

  if (isSlotInPast(slot.date, slot.time)) {
    await ctx.answerCbQuery('Время уже прошло');
    await ctx.reply('Это время уже прошло. Показываю актуальные слоты...');
    return ctx.scene.reenter();
  }

  const { masterName } = ctx.session.booking;
  const stillFree = await isSlotAvailable(masterName, slot.date, slot.time);
  if (!stillFree) {
    await ctx.answerCbQuery('Это время уже занято');
    await ctx.reply('Это время только что заняли. Показываю актуальные слоты...');
    return ctx.scene.reenter();
  }

  ctx.session.booking.date = slot.date;
  ctx.session.booking.time = slot.time;
  ctx.session.booking.slotLabel = slot.label;
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENES.CONFIRM_BOOKING);
});

registerRestart(showSlotsScene);
registerAiFallback(showSlotsScene);

// --- CONFIRM_BOOKING ---
export const confirmBookingScene = new Scenes.BaseScene(SCENES.CONFIRM_BOOKING);
registerGlobalCommands(confirmBookingScene);

confirmBookingScene.enter(async (ctx) => {
  const b = ctx.session.booking;
  await ctx.reply(
    'Проверьте данные записи:\n\n' +
      `💇 Услуга: ${b.service}${b.price ? ` — ${b.price} ₽` : ''}\n` +
      `✂️ Мастер: ${b.masterName}\n` +
      `👤 Клиент: ${b.name} ${b.surname}\n` +
      `📱 Телефон: ${b.phone}\n` +
      `🕐 Время: ${b.slotLabel}\n\n` +
      'Всё верно?',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Подтвердить запись', 'confirm')],
      [Markup.button.callback('🔄 Начать заново', 'restart')],
    ])
  );
});

confirmBookingScene.action('confirm', async (ctx) => {
  await ctx.answerCbQuery();
  const b = { ...ctx.session.booking, userId: ctx.from.id };

  if (isSlotInPast(b.date, b.time)) {
    await ctx.reply('Это время уже прошло. Выберите другое время.');
    return ctx.scene.enter(SCENES.SHOW_SLOTS);
  }

  const stillFree = await isSlotAvailable(b.masterName, b.date, b.time);
  if (!stillFree) {
    await ctx.reply('Это время уже занято. Обновляю список свободных слотов...');
    return ctx.scene.enter(SCENES.SHOW_SLOTS);
  }

  try {
    // Single POST — Apps Script syncs "Заказы" + master sheet in one transaction.
    await sendBookingToSheets({
      masterName: b.masterName,
      name: b.name,
      surname: b.surname,
      phone: b.phone,
      service: b.service,
      price: b.price,
      time: b.time,
      date: b.date,
      userId: b.userId,
    });

    // Notifications ONLY after Sheets ok: true
    await notifyMasterAboutBooking(
      { masterName: b.masterName, name: b.name, surname: b.surname, service: b.service, time: b.slotLabel },
      ctx.telegram
    );
  } catch (err) {
    console.error('[CONFIRM] Booking failed:', err.message);
    const msg =
      err instanceof SheetsError
        ? `${err.message}\n\nВаши данные сохранены — попробуйте подтвердить ещё раз или выберите другой слот.`
        : 'Временный сбой сервиса записи. Попробуйте через минуту.';
    if (/занят|already booked|slot is taken/i.test(err.message)) {
      await ctx.reply('Это время уже занято. Выберите другой слот.');
      return ctx.scene.enter(SCENES.SHOW_SLOTS);
    }
    await ctx.reply(msg);
    return;
  }

  await ctx.reply(
    `🎉 ${b.name}, запись подтверждена!\n\n` +
      `💇 ${b.service}\n✂️ ${b.masterName}\n🕐 ${b.slotLabel}\n\n` +
      'Ждём вас! Для новой записи — /start',
    Markup.removeKeyboard()
  );

  ctx.session.booking = {};
  return ctx.scene.leave();
});

registerRestart(confirmBookingScene);
registerAiFallback(confirmBookingScene);

export const clientScenes = [
  selectMasterScene,
  selectServiceScene,
  getNameScene,
  getSurnameScene,
  getPhoneScene,
  showSlotsScene,
  confirmBookingScene,
];
