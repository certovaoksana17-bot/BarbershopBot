// Telegram notifications for masters and clients.

import { findMasterByName } from '../config.js';
import { formatSlotLabel } from '../utils/validation.js';

export async function notifyMasterAboutBooking(booking, telegram) {
  const master = findMasterByName(booking.masterName);
  if (!master?.chatId) {
    console.log(`[Notify] Skipped — no chatId for master "${booking.masterName}"`);
    return;
  }

  const text =
    `🔔 Новая запись!\n` +
    `Клиент: ${booking.name} ${booking.surname}\n` +
    `Услуга: ${booking.service}\n` +
    `Время: ${booking.time}`;

  await safeSend(telegram, master.chatId, text);
}

export async function notifyMasterAboutCancellation(booking, telegram, reason = 'client') {
  const master = findMasterByName(booking.masterName);
  if (!master?.chatId) return;

  const title =
    reason === 'auto_release'
      ? '⚠️ Слот освобождён — клиент не подтвердил запись'
      : '❌ Запись отменена клиентом';

  const text =
    `${title}\n` +
    `Клиент: ${booking.name} ${booking.surname}\n` +
    `Услуга: ${booking.service}\n` +
    `Время: ${booking.label || formatSlotLabel(booking.date, booking.time)}`;

  await safeSend(telegram, master.chatId, text);
}

export async function notifyClientReminder(booking, telegram, Markup) {
  if (!booking.userId) return false;

  const text =
    `⏰ Напоминание о записи\n\n` +
    `Завтра в ${booking.time} у вас запись к мастеру ${booking.masterName}.\n` +
    `Услуга: ${booking.service}\n\n` +
    `Подтвердите, если всё ок.`;

  await telegram.sendMessage(booking.userId, text, Markup.inlineKeyboard([
    [Markup.button.callback('✅ Подтверждаю', `booking_confirm:${booking.bookingId}`)],
    [Markup.button.callback('❌ Отменить запись', `booking_cancel:${booking.bookingId}`)],
  ]));
  return true;
}

export async function notifyClientReleased(booking, telegram) {
  if (!booking.userId) return;
  const text =
    `Запись на ${booking.label || formatSlotLabel(booking.date, booking.time)} ` +
    `к мастеру ${booking.masterName} была отменена — слот не подтверждён вовремя.`;
  await safeSend(telegram, booking.userId, text);
}

async function safeSend(telegram, chatId, text) {
  try {
    await telegram.sendMessage(chatId, text);
  } catch (err) {
    console.error(`[Notify] Failed to send to ${chatId}:`, err.response?.description || err.message);
  }
}
