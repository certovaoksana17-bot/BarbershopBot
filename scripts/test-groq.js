// Quick Groq smoke test — run: node scripts/test-groq.js
import { askGroq } from '../services/groq.js';
import { GROQ_MODEL } from '../config.js';

const cases = [
  'Привет! Какие услуги есть в парикмахерской?',
  'Хочу мужскую стрижку',
  'Есть маникюр?',
  'Отмена',
];

console.log(`[test-groq] model: ${GROQ_MODEL}\n`);

for (const question of cases) {
  const { intent, reply } = await askGroq(question);
  console.log('---');
  console.log('Q:', question);
  console.log('intent:', intent);
  console.log('reply:', reply);
  console.log('');
}
