const ROLES = {
  ADMIN: 'admin',
  MANAGEMENT: 'management',
  ELDERLY: 'elderly',
  GUARDIAN: 'guardian',
  DEVICE: 'device',
};

const ALERT_TYPES = {
  HEART_ATTACK: 'heart_attack',
  CARDIAC_ARREST: 'cardiac_arrest',
  PANIC: 'panic',
  FALL_DETECTED: 'fall_detected',
  ABNORMAL_HEART_RATE: 'abnormal_heart_rate',
  LOW_SPO2: 'low_spo2',
  HIGH_TEMPERATURE: 'high_temperature',
  LOW_TEMPERATURE: 'low_temperature',
  HIGH_BLOOD_PRESSURE: 'high_blood_pressure',
  LOW_BLOOD_PRESSURE: 'low_blood_pressure',
  NO_MOVEMENT: 'no_movement',
  DEVICE_OFFLINE: 'device_offline',
  POTENTIAL_DEATH: 'potential_death',
  MANUAL_SOS: 'manual_sos',
};

const ALERT_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

const ALERT_STATUS = {
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated',
};

const HEALTH_STATUS = {
  NORMAL: 'normal',
  WARNING: 'warning',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
  OFFLINE: 'offline',
};

const REPORT_TYPE = {
  THIRTY_MINUTE: '30_minute',
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MANUAL: 'manual',
};

const THRESHOLDS = {
  HEART_RATE: {
    MIN: parseInt(process.env.HEART_RATE_MIN) || 40,
    MAX: parseInt(process.env.HEART_RATE_MAX) || 150,
    CRITICAL_LOW: 35,
    CRITICAL_HIGH: 180,
    PANIC_PATTERN_THRESHOLD: 130,
  },
  SPO2: {
    MIN: parseFloat(process.env.SPO2_MIN) || 90,
    CRITICAL: 85,
  },
  SYSTOLIC_BP: {
    MIN: parseInt(process.env.SYSTOLIC_BP_MIN) || 80,
    MAX: parseInt(process.env.SYSTOLIC_BP_MAX) || 200,
    CRITICAL_HIGH: 220,
  },
  DIASTOLIC_BP: {
    MIN: parseInt(process.env.DIASTOLIC_BP_MIN) || 50,
    MAX: parseInt(process.env.DIASTOLIC_BP_MAX) || 120,
  },
  TEMPERATURE: {
    MIN: parseFloat(process.env.TEMPERATURE_MIN) || 35.0,
    MAX: parseFloat(process.env.TEMPERATURE_MAX) || 40.5,
    CRITICAL_LOW: 34.0,
    CRITICAL_HIGH: 41.0,
  },
  NO_MOVEMENT_MINUTES: 30,
  DEVICE_OFFLINE_MINUTES: 10,
};

const SOCKET_EVENTS = {
  // Server -> Client
  HEALTH_UPDATE: 'health:update',
  ALERT_NEW: 'alert:new',
  ALERT_RESOLVED: 'alert:resolved',
  REPORT_READY: 'report:ready',
  DEVICE_STATUS: 'device:status',
  ELDERLY_STATUS: 'elderly:status',
  // Client -> Server
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  ACKNOWLEDGE_ALERT: 'alert:acknowledge',
};

const REDIS_KEYS = {
  LATEST_READING: (elderlyId) => `health:latest:${elderlyId}`,
  READINGS_STREAM: (elderlyId) => `health:stream:${elderlyId}`,
  ACTIVE_ALERTS: (elderlyId) => `alerts:active:${elderlyId}`,
  DEVICE_HEARTBEAT: (deviceId) => `device:heartbeat:${deviceId}`,
  ONLINE_GUARDIANS: 'online:guardians',
  SESSION_BLACKLIST: (token) => `blacklist:${token}`,
};

module.exports = {
  ROLES,
  ALERT_TYPES,
  ALERT_SEVERITY,
  ALERT_STATUS,
  HEALTH_STATUS,
  REPORT_TYPE,
  THRESHOLDS,
  SOCKET_EVENTS,
  REDIS_KEYS,
};
