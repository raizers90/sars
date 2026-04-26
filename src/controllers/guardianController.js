const { Op } = require('sequelize');
const { ElderlyProfile, HealthReading, Alert, Report, GuardianElderly, User } = require('../models/index');
const { success, notFound, forbidden, paginate } = require('../utils/response');
const { getActiveAlerts, acknowledgeAlert, resolveAlert } = require('../services/alertService');
const { redisGet, redisLRange } = require('../config/redis');
const { REDIS_KEYS } = require('../utils/constants');

// Get all elderly assigned to this guardian
const getMyWards = async (req, res) => {
  const assignments = await GuardianElderly.findAll({
    where: { guardian_id: req.user.id, is_active: true },
    include: [
      {
        model: ElderlyProfile,
        as: 'elderlyProfile',
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }],
      },
    ],
  });

  const wards = assignments.map((a) => ({
    assignment_id: a.id,
    relationship: a.relationship,
    is_primary: a.is_primary,
    access_level: a.access_level,
    elderly: a.elderlyProfile,
  }));

  success(res, wards, `You are monitoring ${wards.length} elderly person(s)`);
};

// Verify guardian has access to specific elderly
const verifyAccess = async (guardianId, elderlyId) => {
  const assignment = await GuardianElderly.findOne({
    where: { guardian_id: guardianId, elderly_id: elderlyId, is_active: true },
  });
  if (!assignment) throw Object.assign(new Error('Access denied to this elderly profile'), { statusCode: 403 });
  return assignment;
};

// Get elderly profile (live view)
const getElderlyProfile = async (req, res) => {
  await verifyAccess(req.user.id, req.params.elderly_id);

  const profile = await ElderlyProfile.findByPk(req.params.elderly_id, {
    include: [
      { model: User, as: 'user', attributes: { exclude: ['password_hash'] } },
    ],
  });
  if (!profile) return notFound(res, 'Elderly profile not found');

  success(res, { ...profile.toJSON(), age: profile.getAge() });
};

// Get live health reading (from Redis cache)
const getLiveReading = async (req, res) => {
  await verifyAccess(req.user.id, req.params.elderly_id);

  const cached = await redisGet(REDIS_KEYS.LATEST_READING(req.params.elderly_id));
  if (cached) return success(res, cached, 'Live reading retrieved');

  const reading = await HealthReading.findOne({
    where: { elderly_id: req.params.elderly_id },
    order: [['reading_timestamp', 'DESC']],
  });

  success(res, reading, reading ? 'Latest reading retrieved' : 'No readings available yet');
};

// Get real-time stream (last N readings)
const getReadingStream = async (req, res) => {
  await verifyAccess(req.user.id, req.params.elderly_id);

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const stream = await redisLRange(REDIS_KEYS.READINGS_STREAM(req.params.elderly_id), 0, limit - 1);

  if (stream.length > 0) {
    return success(res, stream, `Last ${stream.length} readings (from real-time cache)`);
  }

  // Fallback to DB
  const readings = await HealthReading.findAll({
    where: { elderly_id: req.params.elderly_id },
    order: [['reading_timestamp', 'DESC']],
    limit,
  });

  success(res, readings.reverse());
};

// Historical readings
const getElderlyReadings = async (req, res) => {
  await verifyAccess(req.user.id, req.params.elderly_id);

  const { page = 1, limit = 50, from, to } = req.query;
  const where = { elderly_id: req.params.elderly_id };
  if (from || to) {
    where.reading_timestamp = {};
    if (from) where.reading_timestamp[Op.gte] = new Date(from);
    if (to) where.reading_timestamp[Op.lte] = new Date(to);
  }

  const { count, rows } = await HealthReading.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['reading_timestamp', 'DESC']],
  });

  paginate(res, rows, count, page, limit);
};

// Active alerts for an elderly
const getElderlyAlerts = async (req, res) => {
  await verifyAccess(req.user.id, req.params.elderly_id);

  const { status, severity, page = 1, limit = 30 } = req.query;
  const where = { elderly_id: req.params.elderly_id };
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const { count, rows } = await Alert.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['created_at', 'DESC']],
  });

  paginate(res, rows, count, page, limit);
};

// Acknowledge alert
const acknowledgeAlertHandler = async (req, res) => {
  const alert = await Alert.findByPk(req.params.alert_id);
  if (!alert) return notFound(res, 'Alert not found');

  await verifyAccess(req.user.id, alert.elderly_id);

  const updated = await acknowledgeAlert(req.params.alert_id, req.user.id);
  success(res, updated, 'Alert acknowledged');
};

// Resolve alert
const resolveAlertHandler = async (req, res) => {
  const alert = await Alert.findByPk(req.params.alert_id);
  if (!alert) return notFound(res, 'Alert not found');

  await verifyAccess(req.user.id, alert.elderly_id);

  const updated = await resolveAlert(req.params.alert_id, req.user.id, req.body.notes);
  success(res, updated, 'Alert resolved');
};

// Get reports for an elderly
const getElderlyReports = async (req, res) => {
  await verifyAccess(req.user.id, req.params.elderly_id);

  const { page = 1, limit = 20, from, to, type } = req.query;
  const where = { elderly_id: req.params.elderly_id };
  if (type) where.report_type = type;
  if (from || to) {
    where.period_start = {};
    if (from) where.period_start[Op.gte] = new Date(from);
    if (to) where.period_start[Op.lte] = new Date(to);
  }

  const { count, rows } = await Report.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['period_start', 'DESC']],
  });

  paginate(res, rows, count, page, limit);
};

// Get single report
const getElderlyReport = async (req, res) => {
  const report = await Report.findByPk(req.params.report_id, {
    include: [{ model: ElderlyProfile, as: 'elderlyProfile', include: [{ model: User, as: 'user', attributes: ['name'] }] }],
  });
  if (!report) return notFound(res, 'Report not found');

  await verifyAccess(req.user.id, report.elderly_id);
  success(res, report);
};

// Dashboard: summary of all wards
const getGuardianDashboard = async (req, res) => {
  const assignments = await GuardianElderly.findAll({
    where: { guardian_id: req.user.id, is_active: true },
  });

  const wardsData = await Promise.all(
    assignments.map(async (a) => {
      const profile = await ElderlyProfile.findByPk(a.elderly_id, {
        include: [{ model: User, as: 'user', attributes: ['name'] }],
      });
      if (!profile) return null;

      const latestReading = await redisGet(REDIS_KEYS.LATEST_READING(a.elderly_id));
      const activeAlertsCount = await Alert.count({
        where: { elderly_id: a.elderly_id, status: 'active' },
      });

      return {
        elderly_id: a.elderly_id,
        name: profile.user?.name,
        health_status: profile.health_status,
        room_number: profile.room_number,
        device_last_seen: profile.device_last_seen,
        active_alerts: activeAlertsCount,
        latest_reading: latestReading,
        relationship: a.relationship,
        is_primary: a.is_primary,
      };
    })
  );

  success(res, wardsData.filter(Boolean), 'Guardian dashboard retrieved');
};

module.exports = {
  getMyWards, getElderlyProfile, getLiveReading, getReadingStream,
  getElderlyReadings, getElderlyAlerts, acknowledgeAlertHandler,
  resolveAlertHandler, getElderlyReports, getElderlyReport, getGuardianDashboard,
};
