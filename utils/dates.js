// Date helpers for salon timezone (BOOKING_UTC_OFFSET).

import { BOOKING_UTC_OFFSET } from '../config.js';
import { isValidDateInput } from './validation.js';

const WEEKDAYS = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];

export function formatYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getSalonToday(utcOffsetHours = BOOKING_UTC_OFFSET) {
  const now = new Date();
  const salonMs = now.getTime() + (utcOffsetHours * 60 - now.getTimezoneOffset()) * 60000;
  return formatYmd(new Date(salonMs));
}

export function getWeekdayName(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return formatYmd(new Date(Date.UTC(y, m - 1, d + days)));
}

export function compareYmd(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function expandDateRange(start, end, maxDays = 62) {
  if (compareYmd(start, end) > 0) return [];
  const dates = [];
  let cur = start;
  while (compareYmd(cur, end) <= 0) {
    dates.push(cur);
    if (dates.length >= maxDays) break;
    cur = addDays(cur, 1);
  }
  return dates;
}

export function normalizeVacationDates(dates, today = getSalonToday()) {
  const unique = [...new Set(dates.filter((d) => isValidDateInput(d)))].sort();
  if (!unique.length) {
    return { ok: false, error: 'Не удалось распознать даты. Укажите период или дату явнее.' };
  }
  if (unique.some((d) => compareYmd(d, today) < 0)) {
    return { ok: false, error: 'Нельзя отмечать выходной в прошлом. Укажите сегодняшнюю или будущую дату.' };
  }
  if (unique.length > 62) {
    return { ok: false, error: 'Слишком длинный период. Укажите не больше 62 дней за раз.' };
  }
  return { ok: true, dates: unique };
}

const WEEKDAY_TARGETS = [
  ['воскресенье', 0],
  ['понедельник', 1],
  ['вторник', 2],
  ['среду', 3],
  ['среда', 3],
  ['четверг', 4],
  ['пятницу', 5],
  ['пятница', 5],
  ['субботу', 6],
  ['суббота', 6],
];

function getWeekdayIndex(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function nextWeekdayOnOrAfter(ymd, targetDow) {
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(ymd, i);
    if (getWeekdayIndex(candidate) === targetDow) return candidate;
  }
  return null;
}

function parseWeekdayPhrase(text, today) {
  const lower = String(text || '').toLowerCase();
  for (const [name, dow] of WEEKDAY_TARGETS) {
    if (lower.includes(name)) return nextWeekdayOnOrAfter(today, dow);
  }
  return null;
}

export function parseLocalVacationDates(text, today = getSalonToday()) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  if (isValidDateInput(raw)) return [raw];

  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    return [`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`];
  }

  const dm = raw.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (dm) {
    const year = today.slice(0, 4);
    return [`${year}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`];
  }

  const lower = raw.toLowerCase();
  const hasDayAfter = lower.includes('послезавтра');
  const hasTomorrow = lower.includes('завтра');
  if (hasDayAfter && hasTomorrow) return [addDays(today, 1), addDays(today, 2)];
  if (hasDayAfter) return [addDays(today, 2)];
  if (hasTomorrow) return [addDays(today, 1)];

  const weekday = parseWeekdayPhrase(lower, today);
  if (weekday) return [weekday];

  return null;
}
