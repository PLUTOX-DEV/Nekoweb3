const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN missing');

const bot = new TelegramBot(token, { webHook: true });

module.exports = bot;
