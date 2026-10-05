const mongoose = require('mongoose');
let pending;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGO_URI) throw Object.assign(new Error('Database is not configured'), { status: 503 });
  pending ||= mongoose
    .connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'shopco',
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
    })
    .finally(() => {
      pending = undefined;
    });
  try {
    await pending;
  } catch {
    throw Object.assign(new Error('Database is temporarily unavailable'), { status: 503 });
  }
}

module.exports = { connectDB };
