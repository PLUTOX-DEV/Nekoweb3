const axios = require('axios');

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/search?q=';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

const detectCategory = (pair) => {
  const name = pair.baseToken.name.toLowerCase();
  if (name.includes('inu') || name.includes('dog') || name.includes('pepe')) return 'meme';
  if (name.includes('swap') || name.includes('dex') || name.includes('finance')) return 'defi';
  if (name.includes('game') || name.includes('play')) return 'gaming';
  return 'utility';
};

const calculateRisk = (pair) => {
  const reasons = [];
  let score = 'LOW';

  const liquidity = pair.liquidity?.usd || 0;
  const ageHours = (Date.now() - pair.pairCreatedAt) / 36e5;
  const volume = pair.volume?.h24 || 0;

  if (liquidity < 5000) reasons.push('Very low liquidity');
  if (ageHours < 1) reasons.push('Brand new pair');
  if (volume < 1000) reasons.push('Low volume');

  if (reasons.length >= 2) score = 'HIGH';
  else if (reasons.length === 1) score = 'MEDIUM';

  return { score, reasons };
};

const normalizeProject = (pair) => {
  const risk = calculateRisk(pair);

  return {
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    address: pair.baseToken.address,
    chain: pair.chainId,
    category: detectCategory(pair),

    liquidity: pair.liquidity?.usd || 0,
    volume24h: pair.volume?.h24 || 0,
    marketCap: pair.fdv || 0,
    pairAgeHours: (Date.now() - pair.pairCreatedAt) / 36e5,

    website: pair.info?.websites?.[0]?.url || '',
    telegram: pair.info?.socials?.find(s => s.type === 'telegram')?.url || '',
    twitter: pair.info?.socials?.find(s => s.type === 'twitter')?.url || '',

    riskScore: risk.score,
    riskReasons: risk.reasons
  };
};

const fetchNewProjects = async (query = 'eth') => {
  try {
    const { data } = await axios.get(`${DEXSCREENER_API}${query}`);
    if (!data?.pairs) return [];

    return data.pairs.slice(0, 12).map(normalizeProject);
  } catch (err) {
    console.error('DexScreener error:', err.message);
    return [];
  }
};

module.exports = { fetchNewProjects };
