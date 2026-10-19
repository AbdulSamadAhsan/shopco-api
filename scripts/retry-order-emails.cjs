const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const emails = require('../services/orderEmailService');
(async () => {
  await connectDB();
  try { console.log(JSON.stringify(await emails.retryPending(10))); }
  finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.name); process.exitCode = 1; });
