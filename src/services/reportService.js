const { Op } = require('sequelize');
const { ElderlyProfile, HealthReading, Alert, Report, User } = require('../models/index');
const { REPORT_TYPE, ALERT_SEVERITY, HEALTH_STATUS, SOCKET_EVENTS } = require('../utils/constants');
const { generateReportSummary } = require('./healthAnalysisService');
const logger = require('../utils/logger');

let _io = null;
const setSocketIO = (io) => { _io = io; };

const generateReport = async (elderlyId, periodStart, periodEnd, type = REPORT_TYPE.THIRTY_MINUTE) => {
  const elderly = await ElderlyProfile.findByPk(elderlyId, {
    include: [{ model: User, as: 'user', attributes: ['name'] }],
  });

  if (!elderly) {
    logger.warn(`Report generation skipped: elderly profile ${elderlyId} not found`);
    return null;
  }

  const readings = await HealthReading.findAll({
    where: {
      elderly_id: elderlyId,
      reading_timestamp: { [Op.between]: [periodStart, periodEnd] },
    },
    order: [['reading_timestamp', 'ASC']],
  });

  const alerts = await Alert.findAll({
    where: {
      elderly_id: elderlyId,
      created_at: { [Op.between]: [periodStart, periodEnd] },
    },
  });

  const stats = computeStats(readings);
  const alertsSummary = computeAlertsSummary(alerts);
  const overallStatus = determineOverallStatus(stats, alertsSummary);
  const healthTrend = determineHealthTrend(readings);
  const notableEvents = extractNotableEvents(readings, alerts);

  const aiSummary = await generateReportSummary(elderly, stats, alertsSummary, {
    start: periodStart.toISOString(),
    end: periodEnd.toISOString(),
  });

  const recommendations = generateRecommendations(stats, alertsSummary, elderly);

  const report = await Report.create({
    elderly_id: elderlyId,
    report_type: type,
    period_start: periodStart,
    period_end: periodEnd,
    stats,
    alerts_summary: alertsSummary,
    overall_status: overallStatus,
    health_trend: healthTrend,
    total_readings: readings.length,
    anomaly_count: readings.filter((r) => r.health_status !== HEALTH_STATUS.NORMAL).length,
    ai_summary: aiSummary,
    recommendations,
    notable_events: notableEvents,
    is_auto_generated: true,
  });

  logger.info(`Report generated for elderly ${elderlyId} (${type}): ${readings.length} readings, ${alerts.length} alerts`);

  // Notify connected clients
  if (_io) {
    _io.to(`elderly:${elderlyId}`).emit(SOCKET_EVENTS.REPORT_READY, {
      report_id: report.id,
      elderly_id: elderlyId,
      type,
      period_start: periodStart,
      period_end: periodEnd,
      overall_status: overallStatus,
      total_readings: readings.length,
      alerts_count: alerts.length,
    });
    _io.to('monitoring').emit(SOCKET_EVENTS.REPORT_READY, {
      report_id: report.id,
      elderly_id: elderlyId,
      elderly_name: elderly.user?.name,
    });
  }

  return report;
};

const generateAllReports = async () => {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 30 * 60 * 1000);

  const elderlyProfiles = await ElderlyProfile.findAll({
    where: { is_active: true },
  });

  logger.info(`Running 30-minute report generation for ${elderlyProfiles.length} elderly profiles`);

  const results = await Promise.allSettled(
    elderlyProfiles.map((ep) =>
      generateReport(ep.id, periodStart, periodEnd, REPORT_TYPE.THIRTY_MINUTE)
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  logger.info(`Reports generated: ${succeeded} succeeded, ${failed} failed`);
  return { succeeded, failed, total: elderlyProfiles.length };
};

const computeStats = (readings) => {
  const stats = {};
  const fields = ['heart_rate', 'systolic_bp', 'diastolic_bp', 'spo2', 'temperature', 'respiratory_rate'];

  for (const field of fields) {
    const vals = readings.map((r) => r[field]).filter((v) => v !== null && v !== undefined);
    if (vals.length > 0) {
      stats[field] = {
        avg: vals.reduce((s, v) => s + v, 0) / vals.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
        readings_count: vals.length,
      };
    }
  }

  const steps = readings.map((r) => r.steps).filter((v) => v !== null && v !== undefined);
  stats.steps_total = steps.reduce((s, v) => s + v, 0);
  stats.readings_count = readings.length;

  const activityCounts = {};
  readings.forEach((r) => {
    if (r.activity_level) {
      activityCounts[r.activity_level] = (activityCounts[r.activity_level] || 0) + 1;
    }
  });
  stats.activity_summary = activityCounts;

  return stats;
};

const computeAlertsSummary = (alerts) => {
  const summary = { total: alerts.length, by_severity: {}, by_type: {}, critical_events: [] };

  for (const alert of alerts) {
    summary.by_severity[alert.severity] = (summary.by_severity[alert.severity] || 0) + 1;
    summary.by_type[alert.alert_type] = (summary.by_type[alert.alert_type] || 0) + 1;
    if (alert.severity === ALERT_SEVERITY.CRITICAL) {
      summary.critical_events.push({
        type: alert.alert_type,
        title: alert.title,
        time: alert.created_at,
        status: alert.status,
      });
    }
  }

  summary.critical = summary.by_severity[ALERT_SEVERITY.CRITICAL] || 0;
  summary.high = summary.by_severity[ALERT_SEVERITY.HIGH] || 0;
  summary.medium = summary.by_severity[ALERT_SEVERITY.MEDIUM] || 0;

  return summary;
};

const determineOverallStatus = (stats, alertsSummary) => {
  if (alertsSummary.critical > 0) return 'critical';
  if (alertsSummary.high > 2) return 'poor';
  if (alertsSummary.high > 0 || alertsSummary.medium > 3) return 'fair';
  if (alertsSummary.medium > 0) return 'good';
  return 'excellent';
};

const determineHealthTrend = (readings) => {
  if (readings.length < 4) return 'unknown';
  const half = Math.floor(readings.length / 2);
  const firstHalf = readings.slice(0, half).filter((r) => r.heart_rate);
  const secondHalf = readings.slice(half).filter((r) => r.heart_rate);
  if (!firstHalf.length || !secondHalf.length) return 'unknown';
  const avgFirst = firstHalf.reduce((s, r) => s + r.heart_rate, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, r) => s + r.heart_rate, 0) / secondHalf.length;
  const diff = avgSecond - avgFirst;
  if (Math.abs(diff) < 3) return 'stable';
  return diff > 0 ? 'declining' : 'improving';
};

const extractNotableEvents = (readings, alerts) => {
  const events = [];
  const criticals = alerts.filter((a) => a.severity === ALERT_SEVERITY.CRITICAL);
  for (const a of criticals.slice(0, 5)) {
    events.push({ time: a.created_at, type: 'alert', description: a.title, severity: a.severity });
  }
  const falls = readings.filter((r) => r.fall_detected);
  for (const r of falls) {
    events.push({ time: r.reading_timestamp, type: 'fall', description: 'Fall detected by device' });
  }
  const sos = readings.filter((r) => r.sos_triggered);
  for (const r of sos) {
    events.push({ time: r.reading_timestamp, type: 'sos', description: 'Manual SOS triggered' });
  }
  return events.sort((a, b) => new Date(a.time) - new Date(b.time));
};

const generateRecommendations = (stats, alertsSummary, elderly) => {
  const recs = [];
  if (alertsSummary.critical > 0) {
    recs.push('URGENT: Critical health events occurred — review with medical team immediately');
  }
  if (stats.heart_rate?.avg > 100) recs.push('Elevated average heart rate — consider cardiovascular evaluation');
  if (stats.spo2?.min < 93) recs.push('Low SpO2 episodes detected — respiratory assessment recommended');
  if (stats.systolic_bp?.avg > 140) recs.push('Blood pressure consistently elevated — medication review advised');
  if (stats.temperature?.max > 38.5) recs.push('Fever episode detected — monitor for infection');
  if (stats.steps_total < 1000) recs.push('Low physical activity — encourage gentle movement if medically safe');
  return recs;
};

module.exports = { generateReport, generateAllReports, setSocketIO };
