// Telegram notifications to masters — sent ONLY after successful Sheets response.

import { findMasterByName } from '../config.js';

/**
 * Notify master about a new booking.
 * Master must have pressed /start in THIS bot first, or Telegram returns 403.
 */
export async function notifyMasterAboutBooking(booking, telegram) {
  const master = findMasterByName(booking.masterName);
  if (!master?.chatId) {
    console.log(
      `[Notify] Skipped — no chatId for master "${booking.masterName}". ` +
        `Set MASTER_${master?.id?.toUpperCase()}_CHAT_ID in .env`
    );
    return;
  }

  const text =
    `🔔 Новая запись!\n` +
    `Клиент: ${booking.name} ${booking.surname}\n` +
    `Услуга: ${booking.service}\n` +
    `Время: ${booking.time}`;

  try {
    console.log(`[Notify] Sending to master ${master.name}, chatId=${master.chatId}`);
    await telegram.sendMessage(master.chatId, text);
    console.log('[Notify] Sent successfully');
  } catch (err) {
    console.error(
      `[Notify] Failed to send to ${master.name} (chatId=${master.chatId}):`,
      err.response?.description || err.message
    );
    console.error(
      '[Notify] Hint: master must open @GoBarbershopBot and press /start before notifications work.'
    );
  }
}
