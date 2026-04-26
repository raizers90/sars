const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts, please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const deviceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 2 readings/second per IP
  message: { success: false, message: 'Device data rate limit exceeded' },
  keyGenerator: (req) => req.headers['x-device-id'] || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, authLimiter, deviceLimiter };
