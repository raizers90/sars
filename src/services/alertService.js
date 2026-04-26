const { Alert, ElderlyProfile, User, GuardianElderly } = require('../models/index');
const { ALERT_STATUS, ALERT_SEVERITY, REDIS_KEYS, SOCKET_EVENTS } = require('../utils/constants');
const { redisSet, redisGet, redisDel } = require('../config/redis');
const logger = require('../utils/logger');

let _io = null;

const setSocketIO = (io) => { _io = io; };

const createAlerts = async (elderlyId, readingId, alerts, triggerValues, aiAssessment = null) => {
  const created = [];

  for (const alertData of alerts) {
    const alert = await Alert.create({
      elderly_id: elderlyId,
      reading_id: readingId,
      alert_type: alertData.type,
      severity: alertData.severity,
      status: ALERT_STATUS.ACTIVE,
      title: alertData.title,
      description: alertData.description,
      trigger_values: { ...triggerValues, specific_value: alertData.value },
      ai_assessment: aiAssessment,
      auto_generated: true,
    });
    created.push(alert);
  }

  if (created.length > 0) {
    await notifyAlerts(elderlyId, created);
    await updateActiveAlertsCache(elderlyId);
  }

  return created;
};

const notifyAlerts = async (elderlyId, alerts) => {
  if (!_io) return;

  try {
    const elderly = await ElderlyProfile.findByPk(elderlyId, {
      include: [{ model: User, as: 'user', attributes: ['name', 'id'] }],
    });

    const payload = {
      elderly_id: elderlyId,
      elderly_name: elderly?.user?.name ?? 'Unknown',
      room_number: elderly?.room_number,
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.alert_type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        trigger_values: a.trigger_values,
        ai_assessment: a.ai_assessment,
        created_at: a.created_at,
      })),
    };

    const hasCritical = alerts.some((a) => a.severity === ALERT_SEVERITY.CRITICAL);

    // Broadcast to monitoring room (all management + admin)
    _io.to('monitoring').emit(SOCKET_EVENTS.ALERT_NEW, payload);

    // Broadcast to elderly's personal room (guardians watching this specific person)
    _io.to(`elderly:${elderlyId}`).emit(SOCKET_EVENTS.ALERT_NEW, payload);

    // For critical alerts, also broadcast to all-users room
    if (hasCritical) {
      _io.to('critical_alerts').emit(SOCKET_EVENTS.ALERT_NEW, payload);
    }

    logger.warn(`Alerts dispatched for elderly ${elderlyId}: ${alerts.map((a) => a.alert_type).join(', ')}`);
  } catch (err) {
    logger.error('Failed to notify alerts via socket:', err);
  }
};

const acknowledgeAlert = async (alertId, userId) => {
  const alert = await Alert.findByPk(alertId);
  if (!alert) throw Object.assign(new Error('Alert not found'), { statusCode: 404 });
  if (alert.status !== ALERT_STATUS.ACTIVE) {
    throw Object.assign(new Error('Alert is not active'), { statusCode: 400 });
  }

  await alert.update({
    status: ALERT_STATUS.ACKNOWLEDGED,
    acknowledged_by: userId,
    acknowledged_at: new Date(),
  });

  await updateActiveAlertsCache(alert.elderly_id);

  if (_io) {
    _io.to(`elderly:${alert.elderly_id}`).emit(SOCKET_EVENTS.ALERT_RESOLVED, {
      alert_id: alertId,
      status: ALERT_STATUS.ACKNOWLEDGED,
      acknowledged_by: userId,
    });
    _io.to('monitoring').emit(SOCKET_EVENTS.ALERT_RESOLVED, {
      alert_id: alertId,
      status: ALERT_STATUS.ACKNOWLEDGED,
    });
  }

  return alert;
};

const resolveAlert = async (alertId, userId, notes = null) => {
  const alert = await Alert.findByPk(alertId);
  if (!alert) throw Object.assign(new Error('Alert not found'), { statusCode: 404 });

  await alert.update({
    status: ALERT_STATUS.RESOLVED,
    resolved_by: userId,
    resolved_at: new Date(),
    resolution_notes: notes,
  });

  await updateActiveAlertsCache(alert.elderly_id);

  if (_io) {
    _io.to(`elderly:${alert.elderly_id}`).emit(SOCKET_EVENTS.ALERT_RESOLVED, {
      alert_id: alertId,
      status: ALERT_STATUS.RESOLVED,
    });
  }

  return alert;
};

const updateActiveAlertsCache = async (elderlyId) => {
  try {
    const active = await Alert.findAll({
      where: { elderly_id: elderlyId, status: ALERT_STATUS.ACTIVE },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    await redisSet(REDIS_KEYS.ACTIVE_ALERTS(elderlyId), active.map((a) => a.toJSON()), 3600);
  } catch (err) {
    logger.error('Failed to update active alerts cache:', err);
  }
};

const getActiveAlerts = async (elderlyId) => {
  const cached = await redisGet(REDIS_KEYS.ACTIVE_ALERTS(elderlyId));
  if (cached) return cached;

  const alerts = await Alert.findAll({
    where: { elderly_id: elderlyId, status: ALERT_STATUS.ACTIVE },
    order: [['created_at', 'DESC']],
  });
  await redisSet(REDIS_KEYS.ACTIVE_ALERTS(elderlyId), alerts.map((a) => a.toJSON()), 3600);
  return alerts;
};

module.exports = { setSocketIO, createAlerts, acknowledgeAlert, resolveAlert, getActiveAlerts };
