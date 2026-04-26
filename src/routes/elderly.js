const router = require('express').Router();
const { ingestReading, getMyProfile, getMyReadings, getMyLatestReading, getMyAlerts } = require('../controllers/elderlyController');
const { authenticate, authenticateDevice, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { validateRequest } = require('../middleware/validateRequest');
const { healthReadingValidator, paginationValidator } = require('../utils/validators');
const { deviceLimiter } = require('../middleware/rateLimiter');

// Device data ingestion — open in demo mode, only needs device_id
router.post('/readings/ingest', deviceLimiter, authenticateDevice, healthReadingValidator, validateRequest, ingestReading);

// Elderly self-service endpoints — authenticated via JWT
router.get('/me', authenticate, authorize(ROLES.ELDERLY), getMyProfile);
router.get('/me/readings', authenticate, authorize(ROLES.ELDERLY), paginationValidator, validateRequest, getMyReadings);
router.get('/me/readings/latest', authenticate, authorize(ROLES.ELDERLY), getMyLatestReading);
router.get('/me/alerts', authenticate, authorize(ROLES.ELDERLY), paginationValidator, validateRequest, getMyAlerts);

module.exports = router;
