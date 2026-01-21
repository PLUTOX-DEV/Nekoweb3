require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./db');
const commands = require('./commands');

// ✅ connect once
connectDB().catch(err => console.error('DB Connection Error:', err));

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN missing');

// ✅ webhook-only bot
const bot = new TelegramBot(token, { webHook: true });

bot.on('message', async (msg) => {
  try {
    if (
      process.env.ALLOWED_USERNAME &&
      msg.from.username !== process.env.ALLOWED_USERNAME
    ) return;

    await commands(bot, msg);
  } catch (err) {
    console.error('Bot message error:', err);
  }
});

module.exports = bot;
