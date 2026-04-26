const router = require('express').Router();
const {
  getDashboard, getAllUsers, createUser, getUserById,
  updateUser, resetUserPassword, deactivateUser, getSystemStats, getAuditLogs,
} = require('../controllers/adminController');
const { startSimulator, stopSimulator, setScenario, getStatus } = require('../services/demoSimulator');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { success, badRequest } = require('../utils/response');
const { registerValidator } = require('../utils/validators');
const { validateRequest } = require('../middleware/validateRequest');
const { body, param } = require('express-validator');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.MANAGEMENT));

router.get('/dashboard', getDashboard);
router.get('/stats', getSystemStats);
router.get('/audit-logs', getAuditLogs);

// Demo simulator (admin + management)
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

// User management (admin only — applied per-route via second authorize)
router.get('/users', authorize(ROLES.ADMIN), getAllUsers);
router.post('/users', authorize(ROLES.ADMIN), registerValidator, validateRequest, createUser);
router.get('/users/:id', authorize(ROLES.ADMIN), [param('id').isUUID()], validateRequest, getUserById);
router.put('/users/:id', authorize(ROLES.ADMIN), [param('id').isUUID()], validateRequest, updateUser);
router.post('/users/:id/reset-password', authorize(ROLES.ADMIN), [param('id').isUUID(), body('new_password').isLength({ min: 8 })], validateRequest, resetUserPassword);
router.delete('/users/:id', authorize(ROLES.ADMIN), [param('id').isUUID()], validateRequest, deactivateUser);

module.exports = router;
