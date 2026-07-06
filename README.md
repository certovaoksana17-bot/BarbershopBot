# Barbershop Booking Bot v2

Vercel-ready Telegram bot: Redis sessions, client FSM + master cabinet, single POST sync to Google Sheets via Apps Script.

## Structure

```
index.js                  # Entry (polling locally)
bot.js                    # Telegraf + Redis session + handlers
api/webhook.js            # Vercel serverless endpoint
config.js                 # Tokens, masters, services
scenes/clientScene.js     # Client FSM (incl. SELECT_MASTER)
scenes/masterScene.js     # Master cabinet
services/bookingService.js
services/notificationService.js
services/groq.js
utils/validation.js
docs/google-apps-script.js
```

## Local run

```bash
npm install
cp .env.example .env   # fill BOT_TOKEN, REDIS_URL, SHEETS_WEB_APP_URL
npm start
```

## Vercel deploy

1. Push to GitHub → import on Vercel
2. Set all env vars from `.env.example`
3. Deploy → `npm run set-webhook` with `WEBHOOK_DOMAIN` set

## Redis (Upstash)

1. Create DB at [upstash.com](https://upstash.com)
2. Copy **Redis URL** (starts with `rediss://`)
3. Paste into `REDIS_URL`

## Google Sheets setup

See `docs/google-apps-script.js` — run `createMasterSheets()` once, then deploy web app.

## curl test

```bash
curl -X POST "YOUR_SHEETS_URL" -H "Content-Type: application/json" -d "{\"action\":\"book\",\"masterName\":\"Анна\",\"name\":\"Иван\",\"surname\":\"Петров\",\"phone\":\"+79991234567\",\"service\":\"Стрижка\",\"time\":\"10:00\",\"date\":\"2026-07-07\",\"userId\":123}"
```
