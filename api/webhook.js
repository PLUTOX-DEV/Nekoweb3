const bot = require('../src/index');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 🔥 DO NOT reconnect DB here
    await bot.processUpdate(req.body);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).send('Webhook error');
  }
};
