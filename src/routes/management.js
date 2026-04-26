const router = require('express').Router();
const {
  registerElderly, listElderly, getElderly, updateElderly, assignGuardian,
  getReports, getReport, generateManualReport, getAllAlerts,
} = require('../controllers/managementController');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { validateRequest } = require('../middleware/validateRequest');
const { elderlyRegisterValidator, paginationValidator, uuidParamValidator } = require('../utils/validators');
const { body, param } = require('express-validator');

// Admin can also access management routes
router.use(authenticate, authorize(ROLES.ADMIN, ROLES.MANAGEMENT));

// Elderly management
router.post('/elderly', elderlyRegisterValidator, validateRequest, registerElderly);
router.get('/elderly', paginationValidator, validateRequest, listElderly);
router.get('/elderly/:id', uuidParamValidator('id'), validateRequest, getElderly);
router.put('/elderly/:id', uuidParamValidator('id'), validateRequest, updateElderly);

// Guardian assignment
router.post('/assign-guardian', [
  body('elderly_id').isUUID(),
  body('guardian_id').isUUID(),
  body('relationship').optional().trim(),
  body('is_primary').optional().isBoolean(),
], validateRequest, assignGuardian);

// Reports
router.get('/reports', paginationValidator, validateRequest, getReports);
router.get('/reports/:id', uuidParamValidator('id'), validateRequest, getReport);
router.post('/reports/generate', [
  body('elderly_id').isUUID().withMessage('Valid elderly ID required'),
  body('from').isISO8601().withMessage('Valid from date required'),
  body('to').isISO8601().withMessage('Valid to date required'),
], validateRequest, generateManualReport);

// Alerts
router.get('/alerts', paginationValidator, validateRequest, getAllAlerts);

// Demo simulator controls (management can also trigger)
const { startSimulator, stopSimulator, setScenario, getStatus } = require('../services/demoSimulator');
const { success, badRequest } = require('../utils/response');
router.get('/demo/status', (req, res) => success(res, getStatus(), 'Simulator status'));
router.post('/demo/start', async (req, res) => {
  const { scenario = 'normal', interval_seconds = 10 } = req.body;
  const result = await startSimulator({ scenario, interval_seconds });
  success(res, result, result.message);
});
router.post('/demo/stop', (req, res) => {
  const result = stopSimulator();
  success(res, result, result.message);
});
router.post('/demo/scenario', [body('scenario').notEmpty()], validateRequest, (req, res) => {
  const result = setScenario(req.body.scenario);
  if (!result.ok) return badRequest(res, result.message);
  success(res, result, result.message);
});

module.exports = router;
