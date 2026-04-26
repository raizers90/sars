/**
 * Demo Simulator — generates realistic wristband health readings for all
 * registered elderly profiles. Sends readings to the ingest endpoint
 * internally so the full pipeline (analysis → alerts → socket → reports)
 * runs exactly as it would with real hardware.
 */

const { ElderlyProfile, User } = require('../models/index');
const { analyzeReading } = require('./healthAnalysisService');
const { createAlerts } = require('./alertService');
const { emitHealthUpdate } = require('./socketService');
const { redisSet, redisPush } = require('../config/redis');
const { REDIS_KEYS } = require('../utils/constants');
const { HealthReading } = require('../models/index');
const logger = require('../utils/logger');

// Simulator state
const state = {
  running: false,
  intervalMs: 10000,      // reading every 10 seconds per device
  scenario: 'normal',     // 'normal' | 'warning' | 'critical' | 'mixed'
  timers: [],
  stats: { readings: 0, alerts: 0, started_at: null },
};

/** Vital sign ranges per scenario */
const SCENARIOS = {
  normal: {
    heart_rate:   [62, 85],
    systolic_bp:  [110, 130],
    diastolic_bp: [70, 85],
    spo2:         [96, 99],
    temperature:  [36.3, 37.2],
    respiratory_rate: [14, 18],
    steps_per_interval: [5, 25],
    fall_prob: 0,
    sos_prob: 0,
  },
  warning: {
    heart_rate:   [95, 125],
    systolic_bp:  [145, 175],
    diastolic_bp: [92, 110],
    spo2:         [91, 94],
    temperature:  [37.8, 38.9],
    respiratory_rate: [20, 26],
    steps_per_interval: [0, 5],
    fall_prob: 0.03,
    sos_prob: 0,
  },
  critical: {
    heart_rate:   [30, 40],    // dangerously low → cardiac alert
    systolic_bp:  [195, 225],  // hypertensive crisis
    diastolic_bp: [110, 130],
    spo2:         [82, 88],    // critical hypoxia
    temperature:  [39.5, 41.2],
    respiratory_rate: [28, 36],
    steps_per_interval: [0, 0],
    fall_prob: 0.15,
    sos_prob: 0.1,
  },
  mixed: null, // resolved dynamically — rotates randomly per reading
};

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.round(rand(min, max));
const jitter = (val, pct = 0.05) => val * (1 + (Math.random() - 0.5) * pct);

/** Build one synthetic reading for a profile */
const buildReading = (profile, scenario) => {
  const cfg = scenario === 'mixed'
    ? SCENARIOS[['normal', 'normal', 'normal', 'warning', 'critical'][randInt(0, 4)]]
    : SCENARIOS[scenario] || SCENARIOS.normal;

  const [hrMin, hrMax] = cfg.heart_rate;
  const heart_rate = Math.round(jitter(rand(hrMin, hrMax)));
  const systolic_bp = Math.round(jitter(rand(...cfg.systolic_bp)));
  const diastolic_bp = Math.round(jitter(rand(...cfg.diastolic_bp)));
  const spo2 = parseFloat(rand(...cfg.spo2).toFixed(1));
  const temperature = parseFloat(rand(...cfg.temperature).toFixed(1));
  const respiratory_rate = Math.round(rand(...cfg.respiratory_rate));
  const steps = randInt(...cfg.steps_per_interval);
  const fall_detected = Math.random() < cfg.fall_prob;
  const sos_triggered = Math.random() < cfg.sos_prob;
  const activity_level =
    steps === 0 ? 'sedentary' : steps < 10 ? 'light' : steps < 20 ? 'moderate' : 'vigorous';

  return {
    device_id: profile.device_id,
    heart_rate,
    systolic_bp,
    diastolic_bp,
    spo2,
    temperature,
    respiratory_rate,
    steps,
    activity_level,
    fall_detected,
    sos_triggered,
    accelerometer_x: parseFloat((Math.random() * 0.1 - 0.05).toFixed(3)),
    accelerometer_y: parseFloat((Math.random() * 0.1 - 0.05).toFixed(3)),
    accelerometer_z: parseFloat((9.81 + Math.random() * 0.2 - 0.1).toFixed(3)),
    battery_level: randInt(40, 100),
    signal_strength: randInt(-80, -45),
    reading_timestamp: new Date(),
  };
};

/** Process one simulated reading through the full pipeline */
const processReading = async (profile, scenario) => {
  try {
    const data = buildReading(profile, scenario);

    const recentReadings = await HealthReading.findAll({
      where: { elderly_id: profile.id },
      order: [['reading_timestamp', 'DESC']],
      limit: 10,
      attributes: ['heart_rate', 'spo2', 'systolic_bp', 'diastolic_bp', 'temperature'],
    });

    const analysis = await analyzeReading(
      { ...data, fall_detected: !!data.fall_detected, sos_triggered: !!data.sos_triggered },
      profile,
      recentReadings
    );

    const reading = await HealthReading.create({
      elderly_id: profile.id,
      ...data,
      health_status: analysis.status,
      anomaly_score: analysis.anomalyScore,
      ai_analysis: analysis.aiAssessment ? { text: analysis.aiAssessment } : null,
      alerts_triggered: analysis.alerts.map((a) => a.type),
    });

    await profile.update({
      device_last_seen: new Date(),
      last_reading_at: data.reading_timestamp,
      health_status: analysis.status,
    });

    const payload = {
      reading_id: reading.id,
      elderly_id: profile.id,
      elderly_name: profile.user?.name,
      device_id: data.device_id,
      timestamp: data.reading_timestamp,
      vitals: {
        heart_rate: data.heart_rate,
        systolic_bp: data.systolic_bp,
        diastolic_bp: data.diastolic_bp,
        spo2: data.spo2,
        temperature: data.temperature,
        respiratory_rate: data.respiratory_rate,
      },
      activity: {
        steps: data.steps,
        activity_level: data.activity_level,
        fall_detected: data.fall_detected,
        sos_triggered: data.sos_triggered,
      },
      health_status: analysis.status,
      anomaly_score: analysis.anomalyScore,
      battery_level: data.battery_level,
      signal_strength: data.signal_strength,
      _simulated: true,
    };

    await redisSet(REDIS_KEYS.LATEST_READING(profile.id), payload, 3600);
    await redisPush(REDIS_KEYS.READINGS_STREAM(profile.id), payload, 200);
    emitHealthUpdate(profile.id, payload);

    state.stats.readings++;

    if (analysis.alerts.length > 0) {
      const triggerValues = {
        heart_rate: data.heart_rate, systolic_bp: data.systolic_bp,
        diastolic_bp: data.diastolic_bp, spo2: data.spo2,
        temperature: data.temperature, fall_detected: data.fall_detected,
        sos_triggered: data.sos_triggered,
      };
      await createAlerts(profile.id, reading.id, analysis.alerts, triggerValues, analysis.aiAssessment);
      state.stats.alerts += analysis.alerts.length;
    }
  } catch (err) {
    logger.error(`Demo simulator error for profile ${profile.id}:`, err.message);
  }
};

/** Fetch active elderly profiles with device IDs */
const getActiveProfiles = async () => {
  return ElderlyProfile.findAll({
    where: { is_active: true },
    include: [{ model: User, as: 'user', attributes: ['name'] }],
  });
};

/** Start the simulator */
const startSimulator = async (options = {}) => {
  if (state.running) {
    return { ok: false, message: 'Simulator is already running', state: getStatus() };
  }

  state.scenario = options.scenario || 'normal';
  state.intervalMs = (options.interval_seconds || 10) * 1000;
  state.running = true;
  state.stats = { readings: 0, alerts: 0, started_at: new Date().toISOString() };

  const profiles = await getActiveProfiles();
  if (profiles.length === 0) {
    state.running = false;
    return { ok: false, message: 'No active elderly profiles with device IDs found. Run the seed first.' };
  }

  logger.info(`Demo simulator starting: ${profiles.length} device(s), scenario="${state.scenario}", interval=${state.intervalMs}ms`);

  // Stagger start times slightly so readings don't all fire at once
  profiles.forEach((profile, i) => {
    const delay = i * Math.floor(state.intervalMs / profiles.length);
    const timeout = setTimeout(async () => {
      if (!state.running) return;
      // First immediate reading
      await processReading(profile, state.scenario);

      // Then on interval
      const timer = setInterval(async () => {
        if (!state.running) return;
        await processReading(profile, state.scenario);
      }, state.intervalMs);

      state.timers.push(timer);
    }, delay);

    state.timers.push(timeout);
  });

  return {
    ok: true,
    message: `Simulator started for ${profiles.length} device(s)`,
    state: getStatus(),
    devices: profiles.map((p) => ({ id: p.id, name: p.user?.name, device_id: p.device_id })),
  };
};

/** Stop the simulator */
const stopSimulator = () => {
  if (!state.running) {
    return { ok: false, message: 'Simulator is not running' };
  }
  state.timers.forEach((t) => clearInterval(t) || clearTimeout(t));
  state.timers = [];
  state.running = false;
  logger.info(`Demo simulator stopped. Stats: ${state.stats.readings} readings, ${state.stats.alerts} alerts`);
  return { ok: true, message: 'Simulator stopped', stats: state.stats };
};

/** Change scenario without restarting */
const setScenario = (scenario) => {
  if (!Object.keys(SCENARIOS).includes(scenario)) {
    return { ok: false, message: `Unknown scenario. Valid: ${Object.keys(SCENARIOS).join(', ')}` };
  }
  state.scenario = scenario;
  return { ok: true, message: `Scenario changed to "${scenario}"`, state: getStatus() };
};

const getStatus = () => ({
  running: state.running,
  scenario: state.scenario,
  interval_seconds: state.intervalMs / 1000,
  stats: state.stats,
  available_scenarios: Object.keys(SCENARIOS),
});

module.exports = { startSimulator, stopSimulator, setScenario, getStatus };
