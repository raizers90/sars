const jwt = require('jsonwebtoken');
const { User } = require('../models/index');
const { redisSet, redisGet, redisDel } = require('../config/redis');
const { REDIS_KEYS } = require('../utils/constants');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'sars_secret_key_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'sars_refresh_secret';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const generateTokens = (user) => {
  const payload = { id: user.id, role: user.role, email: user.email };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
  return { accessToken, refreshToken };
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT_REFRESH_SECRET);
};

const login = async (email, password, ip = null) => {
  const user = await User.findOne({ where: { email, is_active: true } });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  const valid = await user.validatePassword(password);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  await user.update({ last_login_at: new Date() });

  const tokens = generateTokens(user);

  // Store refresh token in Redis (TTL: 7 days)
  await redisSet(`refresh:${user.id}`, tokens.refreshToken, 7 * 24 * 3600);

  logger.info(`User logged in: ${user.email} (${user.role}) from ${ip}`);
  return { user: user.toSafeJSON(), ...tokens };
};

const refreshTokens = async (refreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  }

  const stored = await redisGet(`refresh:${decoded.id}`);
  if (stored !== refreshToken) {
    throw Object.assign(new Error('Refresh token revoked'), { statusCode: 401 });
  }

  const user = await User.findByPk(decoded.id);
  if (!user || !user.is_active) {
    throw Object.assign(new Error('User not found or inactive'), { statusCode: 401 });
  }

  const tokens = generateTokens(user);
  await redisSet(`refresh:${user.id}`, tokens.refreshToken, 7 * 24 * 3600);
  return { user: user.toSafeJSON(), ...tokens };
};

const logout = async (userId, accessToken) => {
  // Blacklist access token (TTL: 24h)
  await redisSet(REDIS_KEYS.SESSION_BLACKLIST(accessToken), true, 24 * 3600);
  // Remove refresh token
  await redisDel(`refresh:${userId}`);
  logger.info(`User logged out: ${userId}`);
};

const isTokenBlacklisted = async (token) => {
  const result = await redisGet(REDIS_KEYS.SESSION_BLACKLIST(token));
  return !!result;
};

module.exports = { generateTokens, verifyAccessToken, login, refreshTokens, logout, isTokenBlacklisted };
