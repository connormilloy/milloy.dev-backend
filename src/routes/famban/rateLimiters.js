const rateLimit = require('express-rate-limit');

// Famban sees bursts of legitimate activity (creating several cards,
// commenting back and forth) that the shared global limiters (5 req/2s)
// are too tight for. Mirrors the darts module's own relaxed limiter.
const fambanRateLimiter = rateLimit({
  windowMs: 10000, // 10s window
  max: 30,
  message: { error: 'Too many requests, please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { fambanRateLimiter };
