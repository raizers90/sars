const { Op } = require('sequelize');
const { ElderlyProfile, HealthReading, Alert, Report, User } = require('../models/index');
const { success, created, notFound, badRequest, paginate } = require('../utils/response');
const { analyzeReading } = require('../services/healthAnalysisService');
const { createAlerts } = require('../services/alertService');
const { emitHealthUpdate, emitDeviceStatus } = require('../services/socketService');
const { redisSet, redisGet, redisPush } = require('../config/redis');
const { REDIS_KEYS, HEALTH_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Ingest health reading from wristband/smartwatch device.
 * Called by device firmware or gateway — authenticated via device API key.
 */
const ingestReading = async (req, res) => {
  const deviceId = req.deviceId || req.body.device_id;

  // Find elderly profile by device ID
  const profile = await ElderlyProfile.findOne({
    where: { device_id: deviceId, is_active: true },
    include: [{ model: User, as: 'user', attributes: ['name'] }],
  });

  if (!profile) {
    return notFound(res, `No elderly profile found for device: ${deviceId}`);
  }

  const {
    heart_rate, systolic_bp, diastolic_bp, spo2, temperature,
    respiratory_rate, steps, activity_level, fall_detected, sos_triggered,
    accelerometer_x, accelerometer_y, accelerometer_z,
    battery_level, signal_strength, latitude, longitude,
    timestamp, raw_data,
  } = req.body;

  const readingTimestamp = timestamp ? new Date(timestamp) : new Date();

  // Fetch last 10 readings for trend analysis
  const recentReadings = await HealthReading.findAll({
    where: { elderly_id: profile.id },
    order: [['reading_timestamp', 'DESC']],
    limit: 10,
    attributes: ['heart_rate', 'spo2', 'systolic_bp', 'diastolic_bp', 'temperature'],
  });

  // Run health analysis
  const analysis = await analyzeReading(
    { heart_rate, systolic_bp, diastolic_bp, spo2, temperature, respiratory_rate,
      fall_detected: !!fall_detected, sos_triggered: !!sos_triggered },
    profile,
    recentReadings
  );

  // Persist reading
  const reading = await HealthReading.create({
    elderly_id: profile.id,
    device_id: deviceId,
    heart_rate, systolic_bp, diastolic_bp, spo2, temperature, respiratory_rate,
    steps, activity_level,
    fall_detected: !!fall_detected,
    sos_triggered: !!sos_triggered,
    accelerometer_x, accelerometer_y, accelerometer_z,
    battery_level, signal_strength,
    latitude, longitude,
    reading_timestamp: readingTimestamp,
    health_status: analysis.status,
    anomaly_score: analysis.anomalyScore,
    ai_analysis: analysis.aiAssessment ? { text: analysis.aiAssessment } : null,
    alerts_triggered: analysis.alerts.map((a) => a.type),
    raw_data: raw_data || null,
  });

  // Update profile's last seen and health status
  await profile.update({
    device_last_seen: new Date(),
    last_reading_at: readingTimestamp,
    health_status: analysis.status,
  });

  // Cache latest reading for real-time dashboard
  const latestData = {
    reading_id: reading.id,
    elderly_id: profile.id,
    elderly_name: profile.user?.name,
    device_id: deviceId,
    timestamp: readingTimestamp,
    vitals: { heart_rate, systolic_bp, diastolic_bp, spo2, temperature, respiratory_rate },
    activity: { steps, activity_level, fall_detected, sos_triggered },
    health_status: analysis.status,
    anomaly_score: analysis.anomalyScore,
    battery_level,
    signal_strength,
  };
  await redisSet(REDIS_KEYS.LATEST_READING(profile.id), latestData, 3600);
  await redisPush(REDIS_KEYS.READINGS_STREAM(profile.id), latestData, 200);

  // Emit real-time update
  emitHealthUpdate(profile.id, latestData);

  // Create alerts if any detected
  if (analysis.alerts.length > 0) {
    const triggerValues = { heart_rate, systolic_bp, diastolic_bp, spo2, temperature, fall_detected, sos_triggered };
    await createAlerts(profile.id, reading.id, analysis.alerts, triggerValues, analysis.aiAssessment);
  }

  logger.info(`Reading ingested: elderly=${profile.id} device=${deviceId} status=${analysis.status} alerts=${analysis.alerts.length}`);

  created(res, {
    reading_id: reading.id,
    health_status: analysis.status,
    anomaly_score: analysis.anomalyScore,
    alerts_triggered: analysis.alerts.length,
    ai_assessment: analysis.aiAssessment,
  }, 'Health reading recorded');
};

// Elderly viewing their own profile
const getMyProfile = async (req, res) => {
  const profile = await ElderlyProfile.findOne({
    where: { user_id: req.user.id },
    include: [{ model: User, as: 'user', attributes: { exclude: ['password_hash'] } }],
  });
  if (!profile) return notFound(res, 'Profile not found');
  success(res, { ...profile.toJSON(), age: profile.getAge() });
};

// Elderly viewing own health readings
const getMyReadings = async (req, res) => {
  const profile = await ElderlyProfile.findOne({ where: { user_id: req.user.id } });
  if (!profile) return notFound(res, 'Profile not found');

  const { page = 1, limit = 50, from, to } = req.query;
  const where = { elderly_id: profile.id };
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

// Elderly viewing own latest reading
const getMyLatestReading = async (req, res) => {
  const profile = await ElderlyProfile.findOne({ where: { user_id: req.user.id } });
  if (!profile) return notFound(res, 'Profile not found');

  const cached = await redisGet(REDIS_KEYS.LATEST_READING(profile.id));
  if (cached) return success(res, cached);

  const reading = await HealthReading.findOne({
    where: { elderly_id: profile.id },
    order: [['reading_timestamp', 'DESC']],
  });

  success(res, reading);
};

// Elderly viewing own alerts
const getMyAlerts = async (req, res) => {
  const profile = await ElderlyProfile.findOne({ where: { user_id: req.user.id } });
  if (!profile) return notFound(res, 'Profile not found');

  const { status, page = 1, limit = 20 } = req.query;
  const where = { elderly_id: profile.id };
  if (status) where.status = status;

  const { count, rows } = await Alert.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['created_at', 'DESC']],
  });

  paginate(res, rows, count, page, limit);
};

module.exports = { ingestReading, getMyProfile, getMyReadings, getMyLatestReading, getMyAlerts };
