const bot = require('../src/bot');
const commands = require('../src/commands/index');
const connectDB = require('../src/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    await connectDB();

    const update = req.body;

    // 🔥 THIS IS THE KEY YOU WERE MISSING
    await bot.processUpdate(update);

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
};
