const router = require('express').Router();
const { loginHandler, refreshHandler, logoutHandler, meHandler, changePasswordHandler } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { loginValidator } = require('../utils/validators');
const { validateRequest } = require('../middleware/validateRequest');
const { body } = require('express-validator');

router.post('/login', authLimiter, loginValidator, validateRequest, loginHandler);
router.post('/refresh', authLimiter, [body('refresh_token').notEmpty()], validateRequest, refreshHandler);
router.post('/logout', authenticate, logoutHandler);
router.get('/me', authenticate, meHandler);
router.put('/me/password', authenticate, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
], validateRequest, changePasswordHandler);

module.exports = router;
