const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, ElderlyProfile, Alert, HealthReading, Report, AuditLog } = require('../models/index');
const { success, created, badRequest, notFound, conflict, paginate } = require('../utils/response');
const { ROLES } = require('../utils/constants');

// Dashboard
const getDashboard = async (req, res) => {
  const [totalUsers, totalElderly, activeAlerts, todayReadings] = await Promise.all([
    User.count({ where: { is_active: true } }),
    ElderlyProfile.count({ where: { is_active: true } }),
    Alert.count({ where: { status: 'active' } }),
    HealthReading.count({
      where: {
        created_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  const usersByRole = await User.findAll({
    attributes: ['role', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
    group: ['role'],
    raw: true,
  });

  const recentAlerts = await Alert.findAll({
    limit: 10,
    order: [['created_at', 'DESC']],
    include: [{ model: ElderlyProfile, as: 'elderlyProfile', include: [{ model: User, as: 'user', attributes: ['name'] }] }],
  });

  success(res, {
    stats: { totalUsers, totalElderly, activeAlerts, todayReadings },
    usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, parseInt(r.count)])),
    recentAlerts,
  }, 'Dashboard data retrieved');
};

// User Management
const getAllUsers = async (req, res) => {
  const { page = 1, limit = 20, role, search, is_active } = req.query;
  const where = {};
  if (role) where.role = role;
  if (is_active !== undefined) where.is_active = is_active === 'true';
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { count, rows } = await User.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['created_at', 'DESC']],
    attributes: { exclude: ['password_hash'] },
  });

  paginate(res, rows, count, page, limit);
};

const createUser = async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  if (!Object.values(ROLES).includes(role)) {
    return badRequest(res, 'Invalid role');
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) return conflict(res, 'Email already registered');

  const user = await User.create({
    name,
    email,
    password_hash: password,
    role,
    phone,
  });

  created(res, user.toSafeJSON(), 'User created successfully');
};

const getUserById = async (req, res) => {
  const user = await User.findByPk(req.params.id, { attributes: { exclude: ['password_hash'] } });
  if (!user) return notFound(res, 'User not found');
  success(res, user);
};

const updateUser = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return notFound(res, 'User not found');

  const { name, phone, is_active, role, notification_settings } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (is_active !== undefined) updates.is_active = is_active;
  if (role !== undefined) updates.role = role;
  if (notification_settings !== undefined) updates.notification_settings = notification_settings;

  await user.update(updates);
  success(res, user.toSafeJSON(), 'User updated');
};

const resetUserPassword = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return notFound(res, 'User not found');

  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) return badRequest(res, 'Password must be at least 8 characters');

  await user.update({ password_hash: new_password });
  success(res, null, 'Password reset successfully');
};

const deactivateUser = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return notFound(res, 'User not found');
  if (user.id === req.user.id) return badRequest(res, 'Cannot deactivate own account');

  await user.update({ is_active: false });
  success(res, null, 'User deactivated');
};

// System Stats
const getSystemStats = async (req, res) => {
  const [totalReadings, criticalAlerts, reports] = await Promise.all([
    HealthReading.count(),
    Alert.count({ where: { severity: 'critical' } }),
    Report.count(),
  ]);

  const alertsByStatus = await Alert.findAll({
    attributes: ['status', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
    group: ['status'],
    raw: true,
  });

  const elderlyByStatus = await ElderlyProfile.findAll({
    attributes: ['health_status', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
    group: ['health_status'],
    raw: true,
  });

  success(res, {
    totalReadings,
    criticalAlerts,
    reports,
    alertsByStatus: Object.fromEntries(alertsByStatus.map((r) => [r.status, parseInt(r.count)])),
    elderlyByStatus: Object.fromEntries(elderlyByStatus.map((r) => [r.health_status, parseInt(r.count)])),
  });
};

const getAuditLogs = async (req, res) => {
  const { page = 1, limit = 50, user_id, action } = req.query;
  const where = {};
  if (user_id) where.user_id = user_id;
  if (action) where.action = action;

  const { count, rows } = await AuditLog.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['created_at', 'DESC']],
  });

  paginate(res, rows, count, page, limit);
};

module.exports = { getDashboard, getAllUsers, createUser, getUserById, updateUser, resetUserPassword, deactivateUser, getSystemStats, getAuditLogs };
