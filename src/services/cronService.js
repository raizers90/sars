const cron = require('node-cron');
const { ElderlyProfile } = require('../models/index');
const { generateAllReports } = require('./reportService');
const { THRESHOLDS, ALERT_TYPES, ALERT_SEVERITY, REDIS_KEYS } = require('../utils/constants');
const { redisGet, redisSet } = require('../config/redis');
const { createAlerts } = require('./alertService');
const logger = require('../utils/logger');

const REPORT_SCHEDULE = process.env.REPORT_CRON_SCHEDULE || '*/30 * * * *';
const DEVICE_CHECK_SCHEDULE = '*/5 * * * *'; // Every 5 minutes

let reportJob = null;
let deviceCheckJob = null;

const startCronJobs = () => {
  // 30-minute automated report generation
  reportJob = cron.schedule(REPORT_SCHEDULE, async () => {
    logger.info('Cron: Starting 30-minute health report generation');
    try {
      const result = await generateAllReports();
      logger.info(`Cron: Reports complete — ${result.succeeded}/${result.total} succeeded`);
    } catch (err) {
      logger.error('Cron: Report generation failed:', err);
    }
  });

  // Device offline detection (every 5 minutes)
  deviceCheckJob = cron.schedule(DEVICE_CHECK_SCHEDULE, async () => {
    await checkOfflineDevices();
  });

  logger.info(`Cron jobs started — Reports: "${REPORT_SCHEDULE}", Device check: "${DEVICE_CHECK_SCHEDULE}"`);
};

const checkOfflineDevices = async () => {
  try {
    const activeProfiles = await ElderlyProfile.findAll({
      where: { is_active: true },
      attributes: ['id', 'device_id', 'device_last_seen', 'health_status'],
    });

    const offlineThresholdMs = THRESHOLDS.DEVICE_OFFLINE_MINUTES * 60 * 1000;
    const now = Date.now();

    for (const profile of activeProfiles) {
      if (!profile.device_id || !profile.device_last_seen) continue;

      const lastSeen = new Date(profile.device_last_seen).getTime();
      const elapsed = now - lastSeen;

      if (elapsed > offlineThresholdMs) {
        // Avoid duplicate offline alerts — check cache
        const alreadyAlerted = await redisGet(`device:offline:alerted:${profile.id}`);
        if (!alreadyAlerted) {
          logger.warn(`Device offline detected: ${profile.device_id} (elderly: ${profile.id})`);

          await createAlerts(
            profile.id,
            null,
            [{
              type: ALERT_TYPES.DEVICE_OFFLINE,
              severity: ALERT_SEVERITY.HIGH,
              title: 'Wearable Device Offline',
              description: `Device ${profile.device_id} has not sent data for ${Math.round(elapsed / 60000)} minutes. Health monitoring interrupted.`,
              value: { device_id: profile.device_id, last_seen: profile.device_last_seen, elapsed_minutes: Math.round(elapsed / 60000) },
            }],
            { device_id: profile.device_id }
          );

          // Set 1-hour cooldown to avoid alert spam
          await redisSet(`device:offline:alerted:${profile.id}`, true, 3600);
        }
      } else {
        // Device is back online — clear cooldown
        await redisSet(`device:offline:alerted:${profile.id}`, false, 1);
      }
    }
  } catch (err) {
    logger.error('Cron: Device offline check failed:', err);
  }
};

const stopCronJobs = () => {
  if (reportJob) reportJob.stop();
  if (deviceCheckJob) deviceCheckJob.stop();
  logger.info('Cron jobs stopped');
};

module.exports = { startCronJobs, stopCronJobs };
