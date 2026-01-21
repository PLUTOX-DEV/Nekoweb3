const Project = require('../models/Project');
const { fetchNewProjects } = require('../models/web3');

const PROJECTS_PER_PAGE = 3;
const userPage = {}; // Vercel-safe pagination

/* =========================
   UTILITIES
========================= */

const formatAge = (h = 0) => {
  if (h < 1) return '🆕 JUST LAUNCHED';
  if (h < 6) return '🔥 VERY NEW';
  if (h < 24) return '🟢 NEW';
  if (h < 72) return '🟡 RECENT';
  return '⚪ OLD';
};

const timeAgo = (date) => {
  const h = Math.floor((Date.now() - new Date(date)) / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/* =========================
   AI SCORING SYSTEM
========================= */

const alphaScore = (p) => {
  let score = 0;

  // Age (25)
  if (p.pairAgeHours < 1) score += 25;
  else if (p.pairAgeHours < 6) score += 20;
  else if (p.pairAgeHours < 24) score += 10;

  // Liquidity (25)
  if (p.liquidity > 100000) score += 25;
  else if (p.liquidity > 30000) score += 15;
  else if (p.liquidity > 15000) score += 8;

  // Volume (20)
  if (p.volume24h > 200000) score += 20;
  else if (p.volume24h > 50000) score += 10;

  // Risk (20)
  if (p.riskScore === 'LOW') score += 20;
  else if (p.riskScore === 'MEDIUM') score += 10;

  // Category (10)
  if (['meme', 'defi'].includes(p.category)) score += 10;

  return Math.min(score, 100);
};

const moderatorScore = (p) => {
  let score = 0;
  if (p.pairAgeHours < 12) score += 3;
  if (p.telegram) score += 2;
  if (p.liquidity < 40000) score += 2;
  if (p.riskScore === 'LOW') score += 3;
  return score; // /10
};

/* =========================
   AI STRATEGY ENGINE
========================= */

const generateAIStrategy = async () => {
  const fresh = await Project.countDocuments({ pairAgeHours: { $lt: 6 } });
  const lowRisk = await Project.countDocuments({ riskScore: 'LOW' });
  const memes = await Project.countDocuments({ category: 'meme' });

  let phase = 'BALANCED';
  if (fresh > 8) phase = 'EARLY LAUNCH META 🚀';
  if (fresh < 3) phase = 'LOW ACTIVITY 🛑';
  if (lowRisk < 3) phase = 'HIGH RISK ⚠️';

  return (
    `🧠 *Neko AI Market Brain*\n\n` +
    `📊 *Live Signals*\n` +
    `• Fresh pairs (<6h): ${fresh}\n` +
    `• Low-risk projects: ${lowRisk}\n` +
    `• Meme dominance: ${memes}\n\n` +
    `🧭 *Market Phase*\n` +
    `→ *${phase}*\n\n` +
    `🎯 *AI Recommendations*\n` +
    `1️⃣ AlphaScore ≥ 70 only\n` +
    `2️⃣ Liquidity > $20k\n` +
    `3️⃣ Observe Telegram ≥ 10 mins\n` +
    `4️⃣ Never buy first candle\n\n` +
    `_Pattern-based logic — not financial advice_`
  );
};

/* =========================
   COMMAND HANDLER
========================= */

module.exports = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const [command, arg] = (msg.text || '').split(' ');

    /* START */
    if (command === '/start') {
      return bot.sendMessage(
        chatId,
        `🐱‍👤 *NekoWeb3PJ*\n\nPrivate AI-powered Web3 discovery bot\nStatus: *ONLINE* 🚀`,
        { parse_mode: 'Markdown' }
      );
    }

    /* HELP */
    if (command === '/help') {
      return bot.sendMessage(
        chatId,
        `🤖 *Commands*\n\n` +
        `/newprojects [eth|sol|bnb]\n` +
        `/chain eth|sol|bnb\n` +
        `/category meme|defi|utility|gaming\n` +
        `/moderator\n` +
        `/strategy\n`,
        { parse_mode: 'Markdown' }
      );
    }

    /* NEW PROJECTS */
    if (command === '/newprojects') {
      bot.sendChatAction(chatId, 'typing');
      const chain = arg || 'eth';

      userPage[chatId] = (userPage[chatId] || 0) + 1;
      const page = userPage[chatId];

      const live = await fetchNewProjects(chain);
      if (live.length) {
        await Project.bulkWrite(
          live.map(p => ({
            updateOne: {
              filter: { address: p.address },
              update: { $setOnInsert: p },
              upsert: true
            }
          }))
        );
      }

      const projects = await Project.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * PROJECTS_PER_PAGE)
        .limit(PROJECTS_PER_PAGE);

      if (!projects.length) {
        userPage[chatId] = 0;
        return bot.sendMessage(chatId, '❌ No more projects.');
      }

      const ui = projects.map(p => {
        const score = alphaScore(p);
        return (
          `━━━━━━━━━━━━━━\n` +
          `🦁 *${p.name}* ($${p.symbol})\n` +
          `⛓️ ${p.chain.toUpperCase()} | ${p.category.toUpperCase()}\n` +
          `⏱️ ${Math.floor(p.pairAgeHours)}h — ${formatAge(p.pairAgeHours)}\n` +
          `🧠 *AlphaScore:* ${score}/100\n` +
          `💧 Liquidity: $${p.liquidity.toLocaleString()}\n` +
          `📊 Volume: $${p.volume24h.toLocaleString()}\n` +
          `🔗 [DexScreener](https://dexscreener.com/${p.chain}/${p.address})`
        );
      }).join('\n\n');

      return bot.sendMessage(
        chatId,
        `📡 *Latest Projects* | Page ${page}\n\n${ui}`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }

    /* MODERATOR */
    if (command === '/moderator') {
      const projects = await Project.find({
        telegram: { $ne: '' },
        riskScore: { $ne: 'HIGH' }
      }).sort({ pairAgeHours: 1 }).limit(3);

      if (!projects.length) {
        return bot.sendMessage(chatId, 'No early mod opportunities right now.');
      }

      const ui = projects.map(p =>
        `🎯 *${p.name}*\n` +
        `⏱️ ${Math.floor(p.pairAgeHours)}h old\n` +
        `⭐ *Mod Score:* ${moderatorScore(p)}/10\n` +
        `📣 ${p.telegram}\n\n` +
        `_Smart DM:_\n` +
        `Hi team 👋 I’ve been tracking ${p.name} since launch and noticed strong early traction. I’d love to help moderate & grow the community.`
      ).join('\n\n━━━━━━━━━━━━━━\n\n');

      return bot.sendMessage(chatId, ui, { parse_mode: 'Markdown' });
    }

    /* STRATEGY */
    if (command === '/strategy') {
      const strategy = await generateAIStrategy();
      return bot.sendMessage(chatId, strategy, { parse_mode: 'Markdown' });
    }

  } catch (err) {
    console.error(err);
    return bot.sendMessage(msg.chat.id, '⚠️ Internal error.');
  }
};
