const router = require('express').Router();
const {
  getDashboard, getAllUsers, createUser, getUserById,
  updateUser, resetUserPassword, deactivateUser, getSystemStats, getAuditLogs,
} = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { registerValidator } = require('../utils/validators');
const { validateRequest } = require('../middleware/validateRequest');
const { body, param } = require('express-validator');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/dashboard', getDashboard);
router.get('/stats', getSystemStats);
router.get('/audit-logs', getAuditLogs);

// User management
router.get('/users', getAllUsers);
router.post('/users', registerValidator, validateRequest, createUser);
router.get('/users/:id', [param('id').isUUID()], validateRequest, getUserById);
router.put('/users/:id', [param('id').isUUID()], validateRequest, updateUser);
router.post('/users/:id/reset-password', [param('id').isUUID(), body('new_password').isLength({ min: 8 })], validateRequest, resetUserPassword);
router.delete('/users/:id', [param('id').isUUID()], validateRequest, deactivateUser);

module.exports = router;
