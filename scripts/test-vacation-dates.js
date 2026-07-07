// Vacation date parsing smoke test — run: node scripts/test-vacation-dates.js
import { parseVacationDates } from '../services/groq.js';
import { parseLocalVacationDates, getSalonToday } from '../utils/dates.js';

const today = getSalonToday();
console.log(`[test] today: ${today}\n`);

const localCases = [
  '2026-07-15',
  'завтра',
  'завтра и послезавтра',
  '15.07.2026',
];

for (const text of localCases) {
  console.log('local:', text, '=>', parseLocalVacationDates(text, today));
}

const groqCases = [
  'выходной с 1 июня по 3 июня',
  'в этот четверг',
  'отмена',
];

for (const text of groqCases) {
  const result = await parseVacationDates(text);
  console.log('parse:', text, '=>', result);
}
