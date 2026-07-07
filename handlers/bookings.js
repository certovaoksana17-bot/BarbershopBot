// Client bookings list and cancellation.

import { Markup } from 'telegraf';
import {
  getClientBookings,
  cancelBooking,
  confirmBooking,
  SheetsError,
} from '../services/bookingService.js';
import { canModifyBooking } from '../utils/validation.js';
import { notifyMasterAboutCancellation } from '../services/notificationService.js';

export async function showClientBookings(ctx) {
  const userId = ctx.from.id;
  await ctx.reply('Загружаю ваши записи...');

  try {
    const bookings = await getClientBookings(userId);
    if (!bookings.length) {
      return ctx.reply('У вас нет предстоящих записей.');
    }

    for (const booking of bookings) {
      const canCancel = canModifyBooking(booking.date, booking.time);
      const statusLabel =
        booking.status === 'confirmed' ? '✅ подтверждена' : '⏳ ожидает подтверждения';
      let text =
        `📅 ${booking.label}\n` +
        `✂️ Мастер: ${booking.masterName}\n` +
        `💇 ${booking.service}${booking.price ? ` — ${booking.price} ₽` : ''}\n` +
        `Статус: ${statusLabel}`;

      if (!canCancel) {
        text += '\n\nОтмена недоступна менее чем за 2 часа до записи.';
      }

      const keyboard = canCancel
        ? Markup.inlineKeyboard([
            [Markup.button.callback('❌ Отменить', `booking_cancel:${booking.bookingId}`)],
          ])
        : undefined;

      await ctx.reply(text, keyboard);
    }
  } catch (err) {
    console.error('[Bookings] list error:', err.message);
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось загрузить записи.');
  }
}

export async function handleBookingCancel(ctx, bookingId) {
  await ctx.answerCbQuery();
  try {
    const bookings = await getClientBookings(ctx.from.id);
    const booking = bookings.find((b) => b.bookingId === bookingId);
    await cancelBooking({ bookingId, userId: ctx.from.id });
    await ctx.reply('Запись отменена.');
    if (booking) {
      await notifyMasterAboutCancellation(booking, ctx.telegram);
    }
  } catch (err) {
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось отменить запись.');
  }
}

export async function handleBookingConfirm(ctx, bookingId) {
  await ctx.answerCbQuery();
  try {
    await confirmBooking({ bookingId, userId: ctx.from.id });
    await ctx.reply('✅ Запись подтверждена. Ждём вас!');
  } catch (err) {
    await ctx.reply(err instanceof SheetsError ? err.message : 'Не удалось подтвердить запись.');
  }
}
