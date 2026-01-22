require('dotenv').config();
const connectDB = require('./db');
const commands = require('./commands');
const bot = require('./bot');

// ✅ connect once
connectDB().catch(err => console.error('DB Connection Error:', err));

// ✅ attach message handler only for polling mode
if (process.env.USE_POLLING === 'true') {
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
}

module.exports = bot;
