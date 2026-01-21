require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./db');
const commands = require('./commands');

// Connect MongoDB (safe on cold start)
connectDB();

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error('❌ BOT_TOKEN is missing in environment variables');
}

// ✅ Create bot in webhook mode ONLY
const bot = new TelegramBot(token, {
  webHook: true
});

// Handle incoming messages
bot.on('message', async (msg) => {
  try {
    // Optional username restriction
    if (
      process.env.ALLOWED_USERNAME &&
      msg.from.username !== process.env.ALLOWED_USERNAME
    ) {
      return;
    }

    await commands(bot, msg);
  } catch (err) {
    console.error('Bot message error:', err);
  }
});

// ✅ Export bot for Vercel webhook handler
module.exports = bot;
