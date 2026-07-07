// Import smoke test for CI/local checks.
process.env.BOT_TOKEN ||= '123456:TEST_TOKEN';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.SHEETS_WEB_APP_URL ||= 'https://example.com/sheets';
process.env.GROQ_API_KEY ||= 'test-key';

const modules = [
  '../config.js',
  '../services/bookingService.js',
  '../services/catalogService.js',
  '../services/knowledgeService.js',
  '../services/groq.js',
  '../services/assistantService.js',
  '../bot.js',
];

for (const modulePath of modules) {
  await import(modulePath);
  console.log(`[smoke] ok: ${modulePath}`);
}

process.exit(0);
