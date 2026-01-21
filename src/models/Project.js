const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  name: String,
  symbol: String,
  address: { type: String, index: true, unique: true },
  chain: { type: String, index: true },
  category: { type: String, index: true },

  liquidity: Number,
  volume24h: Number,
  marketCap: Number,
  pairAgeHours: Number,

  website: String,
  telegram: String,
  twitter: String,

  riskScore: { type: String, index: true },
  riskReasons: [String],

  coingeckoId: String,
  cmcRank: Number,

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Project', ProjectSchema);
