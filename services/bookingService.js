// Google Sheets integration — all sync logic lives in Apps Script (single network call per action).
// NOTE: Sync logic handled in Apps Script — bot never writes to two sheets separately.

import { SHEETS_WEB_APP_URL } from '../config.js';
import { formatSlotLabel, normalizeTime, isSlotInPast } from '../utils/validation.js';

class SheetsError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = 'SheetsError';
    this.retryable = retryable;
  }
}

async function callSheets(payload, { method = 'POST' } = {}) {
  if (!SHEETS_WEB_APP_URL) {
    throw new SheetsError('Sheets URL is not configured', { retryable: false });
  }

  let response;
  try {
    if (method === 'GET') {
      const url = new URL(SHEETS_WEB_APP_URL);
      Object.entries(payload).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      url.searchParams.set('_ts', String(Date.now()));
      response = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    } else {
      response = await fetch(SHEETS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
    }
  } catch (err) {
    console.error('[Sheets] Network error:', err.message);
    throw new SheetsError('Сервис записи временно недоступен. Попробуйте через минуту.');
  }

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    const exception = text.match(/Exception:\s*([^<(]+)/)?.[1]?.trim();
    console.error('[Sheets] Invalid JSON:', text.slice(0, 200));
    if (exception) {
      throw new SheetsError(
        exception.includes('ВАШ_ID_ТАБЛИЦЫ')
          ? 'В Google Apps Script не указан ID таблицы. Замените ВАШ_ID_ТАБЛИЦЫ на реальный ID из URL Google Sheets и сделайте новый Deploy.'
          : `Ошибка Google Sheets: ${exception}`
      );
    }
    throw new SheetsError('Сервис записи вернул некорректный ответ. Проверьте Apps Script и сделайте новый Deploy.');
  }

  if (!response.ok || result.ok === false) {
    throw new SheetsError(result.message || 'Операция в Google Sheets не выполнена.');
  }

  return result;
}

/**
 * Single POST for booking — Apps Script writes to "Заказы" AND marks master grid.
 */
export async function sendBookingToSheets(data) {
  return callSheets({
    action: 'book',
    masterName: data.masterName,
    name: data.name,
    surname: data.surname,
    phone: data.phone,
    service: data.service,
    price: data.price,
    time: data.time,
    date: data.date,
    userId: data.userId,
  });
}

export async function getMasterServicesFromSheets(masterName) {
  const result = await callSheets({ action: 'get_services', masterName }, { method: 'GET' });
  return result.services || [];
}

export async function saveMasterService({ masterName, serviceId, name, price }) {
  return callSheets({ action: 'save_service', masterName, serviceId, name, price });
}

export async function deleteMasterService({ masterName, serviceId }) {
  return callSheets({ action: 'delete_service', masterName, serviceId });
}

export async function getClientBookings(userId) {
  const result = await callSheets({ action: 'get_client_bookings', userId }, { method: 'GET' });
  return result.bookings || [];
}

export async function cancelBooking({ bookingId, userId }) {
  return callSheets({ action: 'cancel_booking', bookingId, userId });
}

export async function confirmBooking({ bookingId, userId }) {
  return callSheets({ action: 'confirm_booking', bookingId, userId });
}

export async function releaseBooking(bookingId) {
  return callSheets({ action: 'release_booking', bookingId });
}

export async function getReminderBookings() {
  const result = await callSheets({ action: 'get_reminder_bookings' }, { method: 'GET' });
  return result.bookings || [];
}

export async function getUnconfirmedBookings() {
  const result = await callSheets({ action: 'get_unconfirmed_bookings' }, { method: 'GET' });
  return result.bookings || [];
}

export async function markReminderSent(bookingId) {
  return callSheets({ action: 'mark_reminder_sent', bookingId });
}

export async function getAvailableSlots(masterName, date) {
  const result = await callSheets({ action: 'get_slots', masterName, date }, { method: 'GET' });
  return (result.slots || [])
    .map((slot) => {
      const time = normalizeTime(slot.time);
      return {
        ...slot,
        time,
        label: formatSlotLabel(slot.date, time),
      };
    })
    .filter((slot) => !isSlotInPast(slot.date, slot.time));
}

export async function isSlotAvailable(masterName, date, time) {
  const slots = await getAvailableSlots(masterName, date);
  const normalizedTime = normalizeTime(time);
  return slots.some((slot) => slot.date === date && normalizeTime(slot.time) === normalizedTime);
}

export async function getMasterSchedule(masterName) {
  const result = await callSheets({ action: 'get_schedule', masterName }, { method: 'GET' });
  return result.schedule || [];
}

export async function getTodayBookings(masterName) {
  const result = await callSheets({ action: 'get_today_bookings', masterName }, { method: 'GET' });
  return result.bookings || [];
}

export async function markVacation(masterName, date) {
  return callSheets({ action: 'mark_vacation', masterName, date });
}

export { SheetsError };
