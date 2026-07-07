// Booking intent smoke test — run: node scripts/test-assistant-booking-intent.js
import { detectBookingIntent } from '../services/assistantService.js';

const cases = [
  'Хочу записаться к Анне на мужскую стрижку',
  'Можно записаться на окрашивание?',
  'Подскажи цены на услуги',
];

for (const question of cases) {
  const result = await detectBookingIntent(question);
  console.log('---');
  console.log('Q:', question);
  console.log('Intent:', result);
}
