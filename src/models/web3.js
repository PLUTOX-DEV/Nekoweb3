const axios = require('axios');

/**
 * IMPORTANT:
 * - Short timeout (Vercel friendly)
 * - Never throw errors
 */
const http = axios.create({
  timeout: 6000,
  headers: {
    'User-Agent': 'NekoWeb3PJ/1.0'
  }
});

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/search?q=';
const COINGECKO_TRENDING = 'https://api.coingecko.com/api/v3/search/trending';
const PUMP_FUN_API = 'https://frontend-api.pump.fun';

// ---------- CATEGORY DETECTION ----------
const detectCategory = (pair) => {
  const name = (pair?.baseToken?.name || '').toLowerCase();
  const symbol = (pair?.baseToken?.symbol || '').toLowerCase();

  // Meme coins - expanded keywords
  if (/(inu|dog|pepe|cat|shiba|meme|doge|wojak|bonk|floki|pump|fun|moon|safe|baby|rich|diamond|rocket|bull|bear|frog|duck|turtle|dragon|wizard|knight|king|queen|prince|princess|super|ultra|mega|hyper|crypto|coin|token)/.test(name) ||
      /(inu|doge|pepe|shib|bonk|floki|wojak)/.test(symbol)) return 'meme';

  // DeFi
  if (/(swap|dex|finance|yield|stake|dao|lending|borrow|farm|vault|pool|liquidity|amm|defi)/.test(name)) return 'defi';

  // Gaming/NFT
  if (/(game|play|metaverse|nft|collectible|avatar|land|item|weapon|armor|guild|clan|battle|fight|war|race|sport|bet|casino|gamble|dice|card|poker|slot)/.test(name)) return 'gaming';

  return 'utility';
};

// ---------- RISK ENGINE ----------
const calculateRisk = (pair) => {
  const reasons = [];

  const liquidity = pair?.liquidity?.usd || 0;
  const volume = pair?.volume?.h24 || 0;
  const ageHours = pair?.pairCreatedAt
    ? (Date.now() - pair.pairCreatedAt) / 36e5
    : 999;

  if (liquidity < 5000) reasons.push('Very low liquidity');
  if (ageHours < 1) reasons.push('Brand new pair');
  if (volume < 1000) reasons.push('Low 24h volume');

  let score = 'LOW';
  if (reasons.length >= 2) score = 'HIGH';
  else if (reasons.length === 1) score = 'MEDIUM';

  return { score, reasons };
};

// ---------- NORMALIZER ----------
const normalizeProject = (pair) => {
  const risk = calculateRisk(pair);

  return {
    name: pair?.baseToken?.name || 'Unknown',
    symbol: pair?.baseToken?.symbol || '???',

    // ⚠️ IMPORTANT: Use PAIR address for DexScreener links
    address: pair?.pairAddress || '',

    chain: pair?.chainId || 'unknown',
    category: detectCategory(pair),

    liquidity: Math.floor(pair?.liquidity?.usd || 0),
    volume24h: Math.floor(pair?.volume?.h24 || 0),
    marketCap: Math.floor(pair?.fdv || 0),

    pairAgeHours: pair?.pairCreatedAt
      ? Math.floor((Date.now() - pair.pairCreatedAt) / 36e5)
      : 0,

    website: pair?.info?.websites?.[0]?.url || '',
    telegram:
      pair?.info?.socials?.find(s => s.type === 'telegram')?.url || '',
    twitter:
      pair?.info?.socials?.find(s => s.type === 'twitter')?.url || '',

    riskScore: risk.score,
    riskReasons: risk.reasons,

    createdAt: new Date()
  };
};

// ---------- FETCHER ----------
const fetchNewProjects = async (query = 'ethereum') => {
  if (query === 'solana') {
    // For Solana, fetch meme pairs and filter to Solana chain
    try {
      const { data } = await http.get(`${DEXSCREENER_API}meme`);

      if (!data || !Array.isArray(data.pairs)) {
        return [];
      }

      return data.pairs
        .filter(pair => pair.chainId === 'solana')
        .slice(0, 50) // More results for better pagination
        .map(pair => ({ ...normalizeProject(pair), source: 'dexscreener' }))
        .filter(p => p.address);
    } catch (err) {
      console.error('❌ DexScreener fetch failed:', err.message);
      return [];
    }
  }

  // DexScreener for other chains
  try {
    const { data } = await http.get(`${DEXSCREENER_API}${query}`);

    if (!data || !Array.isArray(data.pairs)) {
      return [];
    }

    return data.pairs
      .slice(0, 50) // Increased limit
      .map(pair => ({ ...normalizeProject(pair), source: 'dexscreener' }))
      .filter(p => p.address); // safety
  } catch (err) {
    console.error('❌ DexScreener fetch failed:', err.message);
    return []; // ✅ NEVER crash webhook
  }
};

const fetchPumpFunCoins = async () => {
  try {
    const { data } = await http.get(`${PUMP_FUN_API}/coins/recent`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!Array.isArray(data)) {
      return [];
    }

    return data.slice(0, 10).map(coin => ({
      name: coin.name,
      symbol: coin.symbol,
      address: coin.mint,
      chain: 'solana',
      category: 'meme',
      liquidity: coin.liquidity || 0,
      volume24h: coin.volume || 0,
      marketCap: coin.market_cap || 0,
      pairAgeHours: coin.created_timestamp ? Math.floor((Date.now() - coin.created_timestamp) / 36e5) : 0,
      website: coin.website || '',
      telegram: coin.telegram || '',
      twitter: coin.twitter || '',
      riskScore: 'HIGH',
      riskReasons: ['Pump.fun launch'],
      source: 'pump.fun',
      createdAt: new Date()
    }));
  } catch (err) {
    console.error('❌ Pump.fun fetch failed:', err.message);
    throw err; // Throw to trigger fallback
  }
};

const fetchCoinPrice = async (symbol) => {
  try {
    const { data } = await http.get(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`);

    if (data && data[symbol]) {
      return data[symbol];
    }

    return null;
  } catch (err) {
    console.error('❌ CoinGecko price fetch failed:', err.message);
    return null;
  }
};

const fetchTrendingCoins = async () => {
  try {
    const { data } = await http.get(COINGECKO_TRENDING);

    if (!data || !data.coins) {
      return [];
    }

    return data.coins.slice(0, 10).map(coin => ({
      name: coin.item.name,
      symbol: coin.item.symbol.toUpperCase(),
      thumb: coin.item.thumb,
      marketCapRank: coin.item.market_cap_rank,
      price: coin.item.data?.price || 'N/A',
      change24h: coin.item.data?.price_change_percentage_24h?.usd || 0,
      coingeckoId: coin.item.id,
      createdAt: new Date()
    }));
  } catch (err) {
    console.error('❌ CoinGecko fetch failed:', err.message);
    return [];
  }
};

module.exports = { fetchNewProjects, fetchTrendingCoins, fetchPumpFunCoins, fetchCoinPrice, detectCategory };
