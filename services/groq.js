// Groq AI service for free-text questions (AI_QUERY state).

import Groq from 'groq-sdk';
import { GROQ_API_KEY, GROQ_MODEL } from '../config.js';

const client = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const SYSTEM_PROMPT =
  'Ты — вежливый и краткий бот-помощник парикмахерской. Отвечай на русском. ' +
  'Помогай с услугами, записью и расписанием. Если вопрос не по теме — мягко верни к записи.';

export async function askGroq(userMessage) {
  if (!client) {
    return 'ИИ-помощник временно недоступен. Пожалуйста, воспользуйтесь кнопками меню.';
  }
  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Ты — бот парикмахерской. Пользователь спрашивает: ${userMessage}` },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content?.trim() || 'Не удалось получить ответ.';
  } catch (err) {
    console.error('[Groq] API error:', err.message);
    return 'ИИ-помощник сейчас недоступен. Продолжите запись с помощью кнопок.';
  }
}
