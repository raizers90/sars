const { login, refreshTokens, logout } = require('../services/authService');
const { User } = require('../models/index');
const { AuditLog } = require('../models/index');
const { success, created, badRequest, unauthorized } = require('../utils/response');
const logger = require('../utils/logger');

const loginHandler = async (req, res) => {
  const { email, password } = req.body;
  const result = await login(email, password, req.ip);

  await AuditLog.create({
    user_id: result.user.id,
    action: 'LOGIN',
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
    details: { role: result.user.role },
  });

  success(res, {
    user: result.user,
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    token_type: 'Bearer',
  }, 'Login successful');
};

const refreshHandler = async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return badRequest(res, 'Refresh token required');

  const result = await refreshTokens(refresh_token);
  success(res, {
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    token_type: 'Bearer',
  }, 'Token refreshed');
};

const logoutHandler = async (req, res) => {
  await logout(req.user.id, req.token);

  await AuditLog.create({
    user_id: req.user.id,
    action: 'LOGOUT',
    ip_address: req.ip,
  });

  success(res, null, 'Logged out successfully');
};

const meHandler = async (req, res) => {
  success(res, req.user.toSafeJSON(), 'Profile retrieved');
};

const changePasswordHandler = async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = await User.findByPk(req.user.id);

  const valid = await user.validatePassword(current_password);
  if (!valid) return badRequest(res, 'Current password is incorrect');

  await user.update({ password_hash: new_password });
  success(res, null, 'Password changed successfully');
};

module.exports = { loginHandler, refreshHandler, logoutHandler, meHandler, changePasswordHandler };
