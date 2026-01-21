require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./db');
const commands = require('./commands');

connectDB();

const token = process.env.BOT_TOKEN;
const url = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.URL;
let bot;

if (process.env.NODE_ENV === 'production') {
  // Webhook Mode (Vercel)
  bot = new TelegramBot(token, { webHook: true });
  // Only set webhook if URL is available (prevents errors during build)
  if (url) {
    bot.setWebHook(`${url}/api/webhook`);
  }
} else {
  // Polling Mode (Local Dev)
  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 NekoWeb3PJ Polling Mode');
}

bot.on('message', async (msg) => {
  if (msg.from.username !== process.env.ALLOWED_USERNAME) return;
  await commands(bot, msg);
});

module.exports = bot; // Export for Vercel API handler