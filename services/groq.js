// Groq AI service: intent detection + user-facing reply (strict facts only).

import Groq from 'groq-sdk';
import { GROQ_API_KEY, GROQ_MODEL, SERVICES } from '../config.js';

const client = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const INTENTS = new Set(['ANSWER', 'CANCEL', 'QUESTION', 'OTHER']);

const ALLOWED_PRICES = new Set(SERVICES.map((s) => s.price));
const SERVICES_LIST = SERVICES.map((s) => `- ${s.name} — ${s.price} ₽`).join('\n');
const SERVICES_REPLY =
  `У нас есть такие услуги:\n${SERVICES_LIST}\n\n` +
  'Записаться можно через кнопку «Новая запись».';

const CANCEL_REPLY =
  'Отменили. Если позже захотите записаться — просто напишите снова!';

const QUESTION_REPLY =
  'Я помогаю оставить заявку на услугу барбершопа. Расскажите, что хотите сделать: ' +
  'выбрать стрижку, окрашивание или что-то другое?';

const OTHER_REPLY =
  'Простите, не очень понял. Давайте продолжим: какую услугу хотите выбрать ' +
  'или на какое время записаться?';

const UNKNOWN_SERVICE_REPLY =
  'Такой услуги у нас нет. Доступны только:\n' +
  `${SERVICES_LIST}\n\n` +
  'Записаться можно через кнопку «Новая запись».';

const SYSTEM_PROMPT = `Ты — ассистент Telegram‑бота барбершопа «Barbershop». Твоя задача — определять намерение пользователя и давать короткий ответ.

ЕДИНСТВЕННЫЙ допустимый список услуг и цен (ничего кроме этого не существует):
${SERVICES_LIST}

КРИТИЧЕСКИ ВАЖНО:
- Используй ТОЛЬКО услуги и цены из списка выше. Никаких других услуг, цен, скидок, акций, мастеров, адресов, часов работы, описаний процедур.
- Не дополняй услуги деталями (никаких «классическая», «детская», «маникюр», «маски», «барбер» и т. п.).
- Если спрашивают об услуге, которой нет в списке — скажи, что такой услуги нет, и перечисли только услуги из списка.
- Если спрашивают про все услуги или цены — перечисли дословно весь список из блока выше, без добавлений.
- Ответ — максимум 2–3 коротких предложения.

Правила намерения (одно слово):
- ANSWER — ответ на текущий вопрос бота, выбор услуги, время, подтверждение
- CANCEL — отмена («отмена», «назад», «не надо», «стоп», «выход»)
- QUESTION — вопрос о боте или записи, не прямой ответ на текущий шаг
- OTHER — бессвязный текст, спам, приветствие без смысла

Формат вывода:
Строка 1: ANSWER, CANCEL, QUESTION или OTHER (только одно слово).
Строка 2+: короткий ответ пользователю.

Готовые ответы (используй дословно, когда подходит):
- CANCEL → «${CANCEL_REPLY}»
- QUESTION (не про услуги/цены) → «${QUESTION_REPLY}»
- OTHER → «${OTHER_REPLY}»
- Вопрос про услуги/цены → перечисли весь список услуг из блока выше и предложи «Новая запись»
- Выбор услуги из списка → назови цену из списка и предложи «Новая запись»
- Услуги нет в списке → скажи, что такой услуги нет, перечисли доступные

Запреты:
- Не придумывай факты.
- Не используй «возможно», «скорее всего», «примерно».
- Не выводи JSON, XML и другие форматы.

Примеры:

Ввод: «Хочу мужскую стрижку»
ANSWER
Мужская стрижка стоит 1200 ₽. Хотите записаться через кнопку «Новая запись»?

Ввод: «Отмена»
CANCEL
${CANCEL_REPLY}

Ввод: «Какие услуги есть?»
ANSWER
${SERVICES_REPLY}

Ввод: «Есть маникюр?»
ANSWER
${UNKNOWN_SERVICE_REPLY}

Ввод: «Привет»
OTHER
${OTHER_REPLY}`;

const FALLBACK_REPLY =
  'ИИ-помощник сейчас недоступен. Продолжите запись с помощью кнопок.';

const CANCEL_RE = /^(отмена|назад|не надо|стоп|выход|cancel|stop)$/i;
const SERVICES_QUESTION_RE =
  /услуг|цен|стоит|сколько|прайс|цена|что у вас|что есть|меню|прайс-лист/i;
const UNKNOWN_SERVICE_RE =
  /маникюр|педикюр|брить|бритьё|бритье|детск|классическ|барбер|массаж|эпиляц|перманент|кератин|завивк|гель|балаяж/i;

export function parseGroqResponse(raw) {
  const text = String(raw || '').trim();
  if (!text) return { intent: 'OTHER', reply: OTHER_REPLY };

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0]?.toUpperCase();
  if (first && INTENTS.has(first)) {
    return { intent: first, reply: lines.slice(1).join('\n').trim() || text };
  }
  return { intent: 'OTHER', reply: text };
}

function findMentionedService(text) {
  const lower = String(text || '').toLowerCase();
  return SERVICES.find((s) => lower.includes(s.name.toLowerCase())) || null;
}

function hasForbiddenInvention(reply) {
  if (UNKNOWN_SERVICE_RE.test(reply)) return true;

  const prices = [...String(reply).matchAll(/(\d[\d\s]*)\s*₽/g)].map((m) =>
    Number(m[1].replace(/\s/g, ''))
  );
  return prices.some((p) => !ALLOWED_PRICES.has(p));
}

function sanitizeReply(intent, reply, userMessage) {
  const text = String(userMessage || '').trim();

  if (intent === 'CANCEL') return CANCEL_REPLY;
  if (intent === 'OTHER') return OTHER_REPLY;

  if (CANCEL_RE.test(text)) return CANCEL_REPLY;

  if (SERVICES_QUESTION_RE.test(text)) return SERVICES_REPLY;

  if (UNKNOWN_SERVICE_RE.test(text) && !findMentionedService(text)) {
    return UNKNOWN_SERVICE_REPLY;
  }

  if (intent === 'QUESTION' && !SERVICES_QUESTION_RE.test(text)) {
    return QUESTION_REPLY;
  }

  if (hasForbiddenInvention(reply)) {
    const service = findMentionedService(text) || findMentionedService(reply);
    if (service) {
      return `${service.name} стоит ${service.price} ₽. Хотите записаться через кнопку «Новая запись»?`;
    }
    return SERVICES_REPLY;
  }

  return reply.trim() || OTHER_REPLY;
}

function detectIntentLocally(userMessage) {
  const text = String(userMessage || '').trim();
  if (!text) return null;
  if (CANCEL_RE.test(text)) return { intent: 'CANCEL', reply: CANCEL_REPLY };
  if (SERVICES_QUESTION_RE.test(text)) return { intent: 'ANSWER', reply: SERVICES_REPLY };
  if (UNKNOWN_SERVICE_RE.test(text) && !findMentionedService(text)) {
    return { intent: 'ANSWER', reply: UNKNOWN_SERVICE_REPLY };
  }
  const service = findMentionedService(text);
  if (service && !looksLikeQuestion(text)) {
    return {
      intent: 'ANSWER',
      reply: `${service.name} стоит ${service.price} ₽. Хотите записаться через кнопку «Новая запись»?`,
    };
  }
  return null;
}

function looksLikeQuestion(text) {
  return /\?\s*$/.test(String(text || '').trim());
}

export async function askGroq(userMessage) {
  const local = detectIntentLocally(userMessage);
  if (local) return local;

  if (!client) {
    return {
      intent: 'OTHER',
      reply: 'ИИ-помощник временно недоступен. Пожалуйста, воспользуйтесь кнопками меню.',
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 200,
      temperature: 0,
    });

    const parsed = parseGroqResponse(completion.choices[0]?.message?.content);
    return {
      intent: parsed.intent,
      reply: sanitizeReply(parsed.intent, parsed.reply, userMessage),
    };
  } catch (err) {
    console.error('[Groq] API error:', err.message);
    return { intent: 'OTHER', reply: FALLBACK_REPLY };
  }
}
