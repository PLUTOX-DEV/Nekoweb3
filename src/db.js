const mongoose = require('mongoose');

let isConnected = false;

module.exports = async function connectDB() {
  if (isConnected) return;

  if (!process.env.MONGO_URI) {
    throw new Error('❌ MONGO_URI not set');
  }

  await mongoose.connect(process.env.MONGO_URI, {
    bufferCommands: false,
  });

  isConnected = true;
  console.log('✅ MongoDB connected');
};
