// Input validation helpers for client booking flow.

import { BOOKING_UTC_OFFSET } from '../config.js';export function isValidName(text) {
  const trimmed = String(text || '').trim();
  return trimmed.length >= 2 && trimmed.length <= 50 && /^[A-Za-zА-Яа-яЁё' -]+$/.test(trimmed);
}

export function normalizePhone(raw) {
  return String(raw || '').replace(/[\s()-]/g, '');
}

/** Russian phone: +7 followed by 10 digits. */
export function isValidPhone(phone) {
  return /^\+7\d{10}$/.test(phone);
}

export function formatPhoneInput(text) {
  const cleaned = normalizePhone(text);
  if (/^8\d{10}$/.test(cleaned)) return `+7${cleaned.slice(1)}`;
  if (/^7\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{10}$/.test(cleaned)) return `+7${cleaned}`;
  return cleaned;
}

export function looksLikeQuestion(text) {
  return /\?\s*$/.test(String(text || '').trim());
}

export function isValidDateInput(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(text || '').trim());
}

/** Normalize time from Sheets (may arrive as "09:00" or a Date string). */
export function normalizeTime(value) {
  if (!value) return '';
  const s = String(value).trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (!match) return s;
  const hh = match[1].padStart(2, '0');
  return `${hh}:${match[2]}`;
}

export function formatSlotLabel(date, time) {
  const normalizedTime = normalizeTime(time);
  const parts = String(date).split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]} в ${normalizedTime}`;
  }
  return `${date} в ${normalizedTime}`;
}

/** Returns true if slot start time is already in the past (salon timezone). */
export function isSlotInPast(date, time, utcOffsetHours = BOOKING_UTC_OFFSET) {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = normalizeTime(time).split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return false;
  const slotUtc = Date.UTC(y, m - 1, d, hh - utcOffsetHours, mm, 0);
  return slotUtc <= Date.now();
}