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

module.exports = router;
