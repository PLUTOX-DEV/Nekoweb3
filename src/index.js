require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const commands = require('./commands');

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error('❌ BOT_TOKEN is missing in environment variables');
}

// ✅ Webhook-only bot (NO polling, NO DB here)
const bot = new TelegramBot(token, {
  webHook: true,
});

// Handle incoming Telegram messages
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

module.exports = bot;

