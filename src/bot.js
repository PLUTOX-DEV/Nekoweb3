const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN missing');

const options = process.env.USE_POLLING === 'true' ? { polling: true } : { webHook: true };

const bot = new TelegramBot(token, options);

module.exports = bot;
