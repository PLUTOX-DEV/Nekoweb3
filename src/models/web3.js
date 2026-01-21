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

// ---------- CATEGORY DETECTION ----------
const detectCategory = (pair) => {
  const name = (pair?.baseToken?.name || '').toLowerCase();

  if (/(inu|dog|pepe|cat|shiba|meme)/.test(name)) return 'meme';
  if (/(swap|dex|finance|yield|stake|dao)/.test(name)) return 'defi';
  if (/(game|play|metaverse|nft)/.test(name)) return 'gaming';

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
const fetchNewProjects = async (query = 'eth') => {
  try {
    const { data } = await http.get(`${DEXSCREENER_API}${query}`);

    if (!data || !Array.isArray(data.pairs)) {
      return [];
    }

    return data.pairs
      .slice(0, 10) // ⏱️ limit results for speed
      .map(normalizeProject)
      .filter(p => p.address); // safety
  } catch (err) {
    console.error('❌ DexScreener fetch failed:', err.message);
    return []; // ✅ NEVER crash webhook
  }
};

module.exports = { fetchNewProjects };
