const Project = require('../models/Project');
const { fetchNewProjects, fetchTrendingCoins, fetchCoinPrice, detectCategory } = require('../models/web3');

const PROJECTS_PER_PAGE = 20;
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

const safeSend = (text) =>
  text.length > 3900 ? text.slice(0, 3900) + '\n\n…truncated' : text;

const safeCount = async (query) => {
  try {
    return await Project.countDocuments(query);
  } catch {
    return 0;
  }
};

/* =========================
   AI SCORING SYSTEM
========================= */

const alphaScore = (p) => {
  if (p.riskScore === 'HIGH') return 0;

  const age = Number(p.pairAgeHours) || 0;
  let score = 0;

  // Age (25)
  if (age < 1) score += 25;
  else if (age < 6) score += 20;
  else if (age < 24) score += 10;

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

  // Social bonus
  if (p.telegram && p.twitter) score += 5;

  // FDV sanity check
  if (p.marketCap > 50_000_000) score -= 15;

  return Math.max(0, Math.min(score, 100));
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
  const fresh = await safeCount({ pairAgeHours: { $lt: 6 } });
  const lowRisk = await safeCount({ riskScore: 'LOW' });
  const memes = await safeCount({ category: 'meme' });

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
    `🧭 *Market Phase*\n→ *${phase}*\n\n` +
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
        `/newprojects [eth|sol|bnb|ton|sui|avax|monad|base|arb|op]\n` +
        `/chain eth|sol|bnb|ton|sui|avax|monad|base|arb|op\n` +
        `/category meme|defi|utility|gaming\n` +
        `/top [number]\n` +
        `/search <name>\n` +
        `/price <symbol>\n` +
        `/trending\n` +
        `/refresh\n` +
        `/stats\n` +
        `/moderator\n` +
        `/alert\n` +
        `/strategy`,
        { parse_mode: 'Markdown' }
      );
    }

    /* NEW PROJECTS */
    if (command === '/newprojects') {
      bot.sendChatAction(chatId, 'typing');
      const chainArg = arg || 'all';
      const chainMap = { eth: 'ethereum', sol: 'solana', bnb: 'bsc', ton: 'ton', sui: 'sui', avax: 'avalanche', monad: 'monad', base: 'base', arb: 'arbitrum', op: 'optimism', all: 'all' };
      const chain = chainMap[chainArg] || chainArg;
      const searchQuery = chainArg === 'all' ? 'ethereum' : (chainMap[chainArg] || chainArg); // Default fetch for all

      userPage[chatId] = (userPage[chatId] || 0) + 1;
      const page = userPage[chatId];

      if (chainArg !== 'all') {
        const live = await fetchNewProjects(searchQuery);
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
      }

      const query = chain === 'all' ? {} : { chain };
      const projects = await Project.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PROJECTS_PER_PAGE)
        .limit(PROJECTS_PER_PAGE);

      if (!projects.length) {
        userPage[chatId] = 0;
        return bot.sendMessage(chatId, '❌ No more projects.');
      }

      const ui = projects.map(p => {
        const score = alphaScore(p);
        const verdict =
          score >= 80 ? '🟢 STRONG ALPHA' :
          score >= 60 ? '🟡 WATCH' :
          '🔴 AVOID';

        const link = p.source === 'pump.fun' ? `https://pump.fun/coin/${p.address}` : `https://dexscreener.com/${p.chain}/${p.address}`;

        let extraLinks = '';
        if (p.telegram) extraLinks += ` | 📣 [TG](${p.telegram})`;
        if (p.twitter) extraLinks += ` | 🐦 [TW](${p.twitter})`;
        if (p.website) extraLinks += ` | 🌐 [Web](${p.website})`;

        return (
          `━━━━━━━━━━━━━━\n` +
          `🦁 *${p.name}* ($${p.symbol})\n` +
          `⛓️ ${p.chain.toUpperCase()} | ${p.category.toUpperCase()}\n` +
          `⏱️ ${Math.floor(p.pairAgeHours || 0)}h — ${formatAge(p.pairAgeHours)}\n` +
          `🧠 *AlphaScore:* ${score}/100\n` +
          `📌 *Verdict:* ${verdict}\n` +
          `💧 Liquidity: $${p.liquidity.toLocaleString()}\n` +
          `📊 Volume: $${p.volume24h.toLocaleString()}\n` +
          `💰 MC: $${p.marketCap.toLocaleString()}\n` +
          `🔗 [View](${link})${extraLinks}`
        );
      }).join('\n\n');

      return bot.sendMessage(
        chatId,
        safeSend(`📡 *Latest Projects* | Page ${page}\n\n${ui}`),
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }

    /* MODERATOR */
    if (command === '/moderator') {
      const projects = await Project.find({
        telegram: { $regex: /^https:\/\/t\.me\// },
        riskScore: { $ne: 'HIGH' }
      })
        .sort({ pairAgeHours: 1 })
        .limit(3);

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

    /* CHAIN */
    if (command === '/chain') {
      bot.sendChatAction(chatId, 'typing');
      const chainArg = arg;
      if (!chainArg) return bot.sendMessage(chatId, 'Usage: /chain eth|sol|bnb|ton|sui|avax|monad|base|arb|op');
      const chainMap = { eth: 'ethereum', sol: 'solana', bnb: 'bsc', ton: 'ton', sui: 'sui', avax: 'avalanche', monad: 'monad', base: 'base', arb: 'arbitrum', op: 'optimism' };
      const chain = chainMap[chainArg] || chainArg;

      userPage[chatId] = (userPage[chatId] || 0) + 1;
      const page = userPage[chatId];

      const projects = await Project.find({ chain })
        .sort({ createdAt: -1 })
        .skip((page - 1) * PROJECTS_PER_PAGE)
        .limit(PROJECTS_PER_PAGE);

      if (!projects.length) {
        userPage[chatId] = 0;
        return bot.sendMessage(chatId, `❌ No projects found for ${chainArg.toUpperCase()}.`);
      }

      const ui = projects.map(p => {
        const score = alphaScore(p);
        const verdict =
          score >= 80 ? '🟢 STRONG ALPHA' :
          score >= 60 ? '🟡 WATCH' :
          '🔴 AVOID';

        const link = p.source === 'pump.fun' ? `https://pump.fun/coin/${p.address}` : `https://dexscreener.com/${p.chain}/${p.address}`;

        let extraLinks = '';
        if (p.telegram) extraLinks += ` | 📣 [TG](${p.telegram})`;
        if (p.twitter) extraLinks += ` | 🐦 [TW](${p.twitter})`;
        if (p.website) extraLinks += ` | 🌐 [Web](${p.website})`;

        return (
          `━━━━━━━━━━━━━━\n` +
          `🦁 *${p.name}* ($${p.symbol})\n` +
          `⛓️ ${p.chain.toUpperCase()} | ${p.category.toUpperCase()}\n` +
          `⏱️ ${Math.floor(p.pairAgeHours || 0)}h — ${formatAge(p.pairAgeHours)}\n` +
          `🧠 *AlphaScore:* ${score}/100\n` +
          `📌 *Verdict:* ${verdict}\n` +
          `💧 Liquidity: $${p.liquidity.toLocaleString()}\n` +
          `📊 Volume: $${p.volume24h.toLocaleString()}\n` +
          `💰 MC: $${p.marketCap.toLocaleString()}\n` +
          `🔗 [View](${link})${extraLinks}`
        );
      }).join('\n\n');

      return bot.sendMessage(
        chatId,
        safeSend(`📡 *${chainArg.toUpperCase()} Projects* | Page ${page}\n\n${ui}`),
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }

    /* CATEGORY */
    if (command === '/category') {
      bot.sendChatAction(chatId, 'typing');
      const category = arg;
      if (!category) return bot.sendMessage(chatId, 'Usage: /category meme|defi|utility|gaming');

      userPage[chatId] = (userPage[chatId] || 0) + 1;
      const page = userPage[chatId];

      let projects = [];

      if (category === 'meme') {
        // For memes, fetch trending coins and filter
        const trending = await fetchTrendingCoins();
        projects = trending.filter(coin => detectCategory({ baseToken: { name: coin.name, symbol: coin.symbol } }) === 'meme')
          .slice((page - 1) * PROJECTS_PER_PAGE, page * PROJECTS_PER_PAGE)
          .map(coin => ({
            name: coin.name,
            symbol: coin.symbol,
            address: coin.coingeckoId,
            chain: 'multi',
            category: 'meme',
            liquidity: 0,
            volume24h: 0,
            marketCap: coin.marketCap || 0,
            pairAgeHours: 0,
            website: '',
            telegram: '',
            twitter: '',
            riskScore: 'UNKNOWN',
            riskReasons: [],
            source: 'coingecko',
            createdAt: new Date()
          }));
      } else {
        // For other categories, query DB
        projects = await Project.find({ category })
          .sort({ createdAt: -1 })
          .skip((page - 1) * PROJECTS_PER_PAGE)
          .limit(PROJECTS_PER_PAGE);
      }

      if (!projects.length) {
        userPage[chatId] = 0;
        return bot.sendMessage(chatId, `❌ No projects found in ${category} category.`);
      }

      const ui = projects.map(p => {
        const score = alphaScore(p);
        const verdict =
          score >= 80 ? '🟢 STRONG ALPHA' :
          score >= 60 ? '🟡 WATCH' :
          '🔴 AVOID';

        const link = p.source === 'pump.fun' ? `https://pump.fun/coin/${p.address}` :
                     p.source === 'coingecko' ? `https://www.coingecko.com/en/coins/${p.address}` :
                     `https://dexscreener.com/${p.chain}/${p.address}`;

        let extraLinks = '';
        if (p.telegram) extraLinks += ` | 📣 [TG](${p.telegram})`;
        if (p.twitter) extraLinks += ` | 🐦 [TW](${p.twitter})`;
        if (p.website) extraLinks += ` | 🌐 [Web](${p.website})`;

        return (
          `━━━━━━━━━━━━━━\n` +
          `🦁 *${p.name}* ($${p.symbol})\n` +
          `⛓️ ${p.chain.toUpperCase()} | ${p.category.toUpperCase()}\n` +
          `⏱️ ${Math.floor(p.pairAgeHours || 0)}h — ${formatAge(p.pairAgeHours)}\n` +
          `🧠 *AlphaScore:* ${score}/100\n` +
          `📌 *Verdict:* ${verdict}\n` +
          `💧 Liquidity: $${p.liquidity.toLocaleString()}\n` +
          `📊 Volume: $${p.volume24h.toLocaleString()}\n` +
          `💰 MC: $${p.marketCap.toLocaleString()}\n` +
          `🔗 [View](${link})${extraLinks}`
        );
      }).join('\n\n');

      return bot.sendMessage(
        chatId,
        safeSend(`📡 *${category.toUpperCase()} Projects* | Page ${page}\n\n${ui}`),
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }

    /* TOP */
    if (command === '/top') {
      bot.sendChatAction(chatId, 'typing');
      const limit = Math.min(parseInt(arg) || 5, 10); // Max 10 for performance

      // Fetch recent projects to calculate scores
      const projects = await Project.find({})
        .sort({ createdAt: -1 })
        .limit(100); // Fetch more to sort by score

      if (!projects.length) {
        return bot.sendMessage(chatId, '❌ No projects found.');
      }

      // Calculate scores and sort
      const scored = projects.map(p => ({ ...p.toObject(), score: alphaScore(p) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const ui = scored.map(p => {
        const link = p.source === 'pump.fun' ? `https://pump.fun/coin/${p.address}` : `https://dexscreener.com/${p.chain}/${p.address}`;
        let extraLinks = '';
        if (p.telegram) extraLinks += ` | 📣 [TG](${p.telegram})`;
        if (p.twitter) extraLinks += ` | 🐦 [TW](${p.twitter})`;
        if (p.website) extraLinks += ` | 🌐 [Web](${p.website})`;
        return (
          `🏆 *${p.name}* ($${p.symbol})\n` +
          `⛓️ ${p.chain.toUpperCase()} | ${p.category.toUpperCase()}\n` +
          `🧠 AlphaScore: ${p.score}/100\n` +
          `💰 MC: $${p.marketCap.toLocaleString()}\n` +
          `🔗 [View](${link})${extraLinks}`
        );
      }).join('\n\n');

      return bot.sendMessage(chatId, `🥇 *Top ${limit} Projects by AlphaScore*\n\n${ui}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
    }

    /* SEARCH */
    if (command === '/search') {
      if (!arg) return bot.sendMessage(chatId, 'Usage: /search <project name>');
      bot.sendChatAction(chatId, 'typing');

      const projects = await Project.find({ name: { $regex: arg, $options: 'i' } }).limit(5);

      if (!projects.length) {
        return bot.sendMessage(chatId, `❌ No projects found matching "${arg}".`);
      }

      const ui = projects.map(p => {
        const score = alphaScore(p);
        const link = p.source === 'pump.fun' ? `https://pump.fun/coin/${p.address}` : `https://dexscreener.com/${p.chain}/${p.address}`;
        let extraLinks = '';
        if (p.telegram) extraLinks += ` | 📣 [TG](${p.telegram})`;
        if (p.twitter) extraLinks += ` | 🐦 [TW](${p.twitter})`;
        if (p.website) extraLinks += ` | 🌐 [Web](${p.website})`;
        return (
          `🔍 *${p.name}* ($${p.symbol})\n` +
          `⛓️ ${p.chain.toUpperCase()} | Score: ${score}/100\n` +
          `💰 MC: $${p.marketCap.toLocaleString()}\n` +
          `🔗 [View](${link})${extraLinks}`
        );
      }).join('\n\n');

      return bot.sendMessage(chatId, `🔍 *Search Results for "${arg}"*\n\n${ui}`, { parse_mode: 'Markdown' });
    }

    /* STATS */
    if (command === '/stats') {
      bot.sendChatAction(chatId, 'typing');

      const total = await safeCount({});
      const eth = await safeCount({ chain: 'ethereum' });
      const sol = await safeCount({ chain: 'solana' });
      const bnb = await safeCount({ chain: 'bsc' });
      const ton = await safeCount({ chain: 'ton' });
      const sui = await safeCount({ chain: 'sui' });
      const avax = await safeCount({ chain: 'avalanche' });
      const monad = await safeCount({ chain: 'monad' });
      const base = await safeCount({ chain: 'base' });
      const arb = await safeCount({ chain: 'arbitrum' });
      const op = await safeCount({ chain: 'optimism' });
      const memes = await safeCount({ category: 'meme' });
      const defi = await safeCount({ category: 'defi' });

      return bot.sendMessage(
        chatId,
        `📊 *Market Stats*\n\n` +
        `📈 Total Projects: ${total}\n` +
        `⛓️ ETH: ${eth} | SOL: ${sol} | BSC: ${bnb}\n` +
        `⛓️ TON: ${ton} | SUI: ${sui} | AVAX: ${avax}\n` +
        `⛓️ MONAD: ${monad} | BASE: ${base} | ARB: ${arb} | OP: ${op}\n` +
        `🏷️ Memes: ${memes} | DeFi: ${defi}\n\n` +
        `_Data from DexScreener & CoinGecko_`,
        { parse_mode: 'Markdown' }
      );
    }

    /* REFRESH */
    if (command === '/refresh') {
      bot.sendChatAction(chatId, 'typing');
      const chains = ['ethereum', 'solana', 'bsc', 'ton', 'sui', 'avalanche', 'monad', 'base', 'arbitrum', 'optimism'];
      let totalFetched = 0;

      for (const chain of chains) {
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
          totalFetched += live.length;
        }
      }

      return bot.sendMessage(chatId, `🔄 Refreshed data! Fetched ${totalFetched} new projects across all chains.`);
    }

    /* PRICE */
    if (command === '/price') {
      if (!arg) return bot.sendMessage(chatId, 'Usage: /price <coin_symbol_or_id>');
      bot.sendChatAction(chatId, 'typing');

      const priceData = await fetchCoinPrice(arg.toLowerCase());
      if (!priceData) {
        return bot.sendMessage(chatId, `❌ Could not find price data for "${arg}". Try using the coin ID from CoinGecko (e.g., "bitcoin" instead of "btc").`);
      }

      const change = priceData.usd_24h_change?.toFixed(2) || 'N/A';
      const marketCap = priceData.usd_market_cap ? `$${priceData.usd_market_cap.toLocaleString()}` : 'N/A';

      return bot.sendMessage(
        chatId,
        `💰 *${arg.toUpperCase()}*\n\n` +
        `💵 Price: $${priceData.usd}\n` +
        `📈 24h Change: ${change}%\n` +
        `📊 Market Cap: ${marketCap}`,
        { parse_mode: 'Markdown' }
      );
    }

    /* TRENDING */
    if (command === '/trending') {
      bot.sendChatAction(chatId, 'typing');

      const trending = await fetchTrendingCoins();

      if (!trending.length) {
        return bot.sendMessage(chatId, '❌ Unable to fetch trending coins right now.');
      }

      const ui = trending.map(coin =>
        `🔥 *${coin.name}* ($${coin.symbol})\n` +
        `📊 Rank: #${coin.marketCapRank} | 💰 $${coin.price}\n` +
        `📈 24h Change: ${coin.change24h.toFixed(2)}%\n` +
        `🔗 [CoinGecko](https://www.coingecko.com/en/coins/${coin.coingeckoId})`
      ).join('\n\n');

      return bot.sendMessage(chatId, `🚀 *Trending Coins on CoinGecko*\n\n${ui}`, { parse_mode: 'Markdown' });
    }

    /* ALERT */
    if (command === '/alert') {
      // Simple alert command, perhaps set alert for new projects
      return bot.sendMessage(chatId, '🚨 Alert feature coming soon! Use /strategy for market insights.');
    }

    /* STRATEGY */
    if (command === '/strategy') {
      const strategy = await generateAIStrategy();
      return bot.sendMessage(chatId, strategy, { parse_mode: 'Markdown' });
    }

  } catch (err) {
    console.error('COMMAND ERROR:', err);
    return bot.sendMessage(msg.chat.id, '⚠️ Internal error.');
  }
};
