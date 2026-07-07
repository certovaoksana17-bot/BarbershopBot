// Input validation helpers for client booking flow.

import { BOOKING_UTC_OFFSET } from '../config.js';

const NAME_FORMAT_RE = /^[A-Za-zА-Яа-яЁё' -]+$/;

const REFUSAL_RE =
  /^(я\s+)?(не\s+)?(знаю|помню|скажу|помню\s+имя|знаю\s+имя|хочу\s+говорить)|^(забыл|забыла|хз|нет|ничего|неизвестно|без\s+имени|никто|никак|пропусти|пропустить|skip|test|тест|лол|lol)$/i;

const NON_NAME_WORDS = new Set([
  'не',
  'знаю',
  'помню',
  'забыл',
  'забыла',
  'хз',
  'нет',
  'ничего',
  'неизвестно',
  'никто',
  'тест',
  'test',
  'да',
  'ладно',
  'ок',
  'окей',
  'привет',
  'здравствуйте',
  'пока',
  'стоп',
  'отмена',
  'я',
  'мне',
  'меня',
  'сам',
  'сама',
  'сами',
]);

const REFUSAL_WORDS = new Set(['не', 'знаю', 'помню', 'забыл', 'забыла', 'хочу', 'могу', 'буду', 'скажу']);

function normalizeNameInput(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

export function isRejectedNameAnswer(text) {
  const normalized = normalizeNameInput(text).toLowerCase();
  if (!normalized) return true;
  if (REFUSAL_RE.test(normalized)) return true;

  const words = normalized.split(' ');
  if (words.length === 1 && NON_NAME_WORDS.has(words[0])) return true;
  if (words.length >= 2 && words.some((w) => REFUSAL_WORDS.has(w))) return true;

  return false;
}

export function isValidName(text) {
  const trimmed = normalizeNameInput(text);
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (!NAME_FORMAT_RE.test(trimmed)) return false;
  if (isRejectedNameAnswer(trimmed)) return false;
  return true;
}

export function getNameInputError(text, field = 'имя') {
  const trimmed = normalizeNameInput(text);
  const isSurname = field === 'фамилию';
  if (!trimmed) return `Введите ${field} текстом.`;
  if (isRejectedNameAnswer(trimmed)) {
    return isSurname
      ? 'Пожалуйста, укажите настоящую фамилию — без неё не получится оформить запись.'
      : 'Пожалуйста, укажите настоящее имя — без него не получится оформить запись.';
  }
  if (!NAME_FORMAT_RE.test(trimmed) || trimmed.length < 2 || trimmed.length > 50) {
    return isSurname
      ? 'Введите корректную фамилию (минимум 2 буквы, только кириллица или латиница).'
      : 'Введите корректное имя (минимум 2 буквы, только кириллица или латиница).';
  }
  return null;
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