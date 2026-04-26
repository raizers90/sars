const { verifyAccessToken, isTokenBlacklisted } = require('../services/authService');
const { User } = require('../models/index');
const { unauthorized, forbidden } = require('../utils/response');
const logger = require('../utils/logger');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'Authentication token required');
    }

    const token = authHeader.split(' ')[1];

    if (await isTokenBlacklisted(token)) {
      return unauthorized(res, 'Token has been revoked');
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findByPk(decoded.id);

    if (!user || !user.is_active) {
      return unauthorized(res, 'User not found or inactive');
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError') return unauthorized(res, 'Invalid token');
    logger.error('Auth middleware error:', err);
    return unauthorized(res, 'Authentication failed');
  }
};

// Device authentication (wristband/smartwatch API key)
const authenticateDevice = (req, res, next) => {
  const apiKey = req.headers['x-device-key'] || req.headers['x-api-key'];
  const deviceId = req.headers['x-device-id'] || req.body?.device_id;

  if (!apiKey || apiKey !== process.env.DEVICE_API_KEY) {
    return unauthorized(res, 'Invalid device API key');
  }

  if (!deviceId) {
    return unauthorized(res, 'Device ID required');
  }

  req.deviceId = deviceId;
  next();
};

// Allows both user JWT and device API key
const authenticateAny = async (req, res, next) => {
  const apiKey = req.headers['x-device-key'] || req.headers['x-api-key'];
  if (apiKey) {
    return authenticateDevice(req, res, next);
  }
  return authenticate(req, res, next);
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res, 'Not authenticated');
    if (!roles.includes(req.user.role)) {
      return forbidden(res, `Access restricted to: ${roles.join(', ')}`);
    }
    next();
  };
};

const authorizeOwner = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      const ownerId = await getResourceOwnerId(req);
      if (req.user.role === 'admin' || req.user.id === ownerId) {
        return next();
      }
      return forbidden(res, 'Access denied to this resource');
    } catch {
      return forbidden(res, 'Access denied');
    }
  };
};

module.exports = { authenticate, authenticateDevice, authenticateAny, authorize, authorizeOwner };
