const rateLimit = require('express-rate-limit');

const strictRateLimiter = rateLimit({
  windowMs: 2000,
  max: 1,
  message: {
    error: 'Too many requests, please wait before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const relaxedRateLimiter = rateLimit({
  windowMs: 2000,
  max: 5,
  message: {
    error: 'Too many requests, please wait before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  strictRateLimiter,
  relaxedRateLimiter,
};
