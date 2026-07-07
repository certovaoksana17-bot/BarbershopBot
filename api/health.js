// Quick env check for Vercel (does not expose secret values).

const APP_VERSION = '15e4314';

export default function handler(_req, res) {
  return res.status(200).json({
    ok: true,
    version: APP_VERSION,
    env: {
      BOT_TOKEN: Boolean(process.env.BOT_TOKEN),
      REDIS_URL: Boolean(process.env.REDIS_URL),
      SHEETS_WEB_APP_URL: Boolean(process.env.SHEETS_WEB_APP_URL),
      GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
      WEBHOOK_DOMAIN: Boolean(process.env.WEBHOOK_DOMAIN || process.env.VERCEL_URL),
    },
  });
}
