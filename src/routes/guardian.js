const router = require('express').Router();
const {
  getMyWards, getElderlyProfile, getLiveReading, getReadingStream,
  getElderlyReadings, getElderlyAlerts, acknowledgeAlertHandler,
  resolveAlertHandler, getElderlyReports, getElderlyReport, getGuardianDashboard,
} = require('../controllers/guardianController');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { validateRequest } = require('../middleware/validateRequest');
const { paginationValidator } = require('../utils/validators');
const { param, body } = require('express-validator');

// Admin can also access guardian routes for support purposes
router.use(authenticate, authorize(ROLES.GUARDIAN, ROLES.ADMIN, ROLES.MANAGEMENT));

// Dashboard
router.get('/dashboard', getGuardianDashboard);
router.get('/wards', getMyWards);

// Per-elderly monitoring
router.get('/elderly/:elderly_id/profile', [param('elderly_id').isUUID()], validateRequest, getElderlyProfile);
router.get('/elderly/:elderly_id/live', [param('elderly_id').isUUID()], validateRequest, getLiveReading);
router.get('/elderly/:elderly_id/stream', [param('elderly_id').isUUID()], validateRequest, getReadingStream);
router.get('/elderly/:elderly_id/readings', [param('elderly_id').isUUID(), ...paginationValidator], validateRequest, getElderlyReadings);
router.get('/elderly/:elderly_id/alerts', [param('elderly_id').isUUID(), ...paginationValidator], validateRequest, getElderlyAlerts);
router.get('/elderly/:elderly_id/reports', [param('elderly_id').isUUID(), ...paginationValidator], validateRequest, getElderlyReports);
router.get('/elderly/:elderly_id/reports/:report_id', [param('elderly_id').isUUID(), param('report_id').isUUID()], validateRequest, getElderlyReport);

// Alert management
router.post('/alerts/:alert_id/acknowledge', [param('alert_id').isUUID()], validateRequest, acknowledgeAlertHandler);
router.post('/alerts/:alert_id/resolve', [param('alert_id').isUUID(), body('notes').optional().trim()], validateRequest, resolveAlertHandler);

module.exports = router;
