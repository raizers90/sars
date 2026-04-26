const Anthropic = require('@anthropic-ai/sdk');
const { THRESHOLDS, ALERT_TYPES, ALERT_SEVERITY, HEALTH_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Analyze a health reading using rule-based detection + AI assessment.
 * Returns { status, anomalyScore, alerts, aiAssessment }
 */
const analyzeReading = async (reading, elderlyProfile, recentReadings = []) => {
  const thresholds = buildThresholds(elderlyProfile);
  const ruleAlerts = detectRuleBasedAlerts(reading, thresholds);
  const anomalyScore = computeAnomalyScore(reading, ruleAlerts, recentReadings);
  const status = determineHealthStatus(anomalyScore, ruleAlerts);

  let aiAssessment = null;
  // Call Claude AI for critical or high-risk readings
  if (anomalyScore >= 60 || ruleAlerts.some((a) => a.severity === ALERT_SEVERITY.CRITICAL)) {
    aiAssessment = await getAIAssessment(reading, elderlyProfile, ruleAlerts, recentReadings);
  }

  return { status, anomalyScore, alerts: ruleAlerts, aiAssessment };
};

const buildThresholds = (profile) => {
  const custom = profile?.custom_thresholds || {};
  return {
    heart_rate: {
      min: custom.heart_rate_min ?? THRESHOLDS.HEART_RATE.MIN,
      max: custom.heart_rate_max ?? THRESHOLDS.HEART_RATE.MAX,
      critical_low: custom.heart_rate_critical_low ?? THRESHOLDS.HEART_RATE.CRITICAL_LOW,
      critical_high: custom.heart_rate_critical_high ?? THRESHOLDS.HEART_RATE.CRITICAL_HIGH,
    },
    spo2: {
      min: custom.spo2_min ?? THRESHOLDS.SPO2.MIN,
      critical: custom.spo2_critical ?? THRESHOLDS.SPO2.CRITICAL,
    },
    systolic_bp: {
      min: custom.systolic_bp_min ?? THRESHOLDS.SYSTOLIC_BP.MIN,
      max: custom.systolic_bp_max ?? THRESHOLDS.SYSTOLIC_BP.MAX,
      critical_high: custom.systolic_bp_critical ?? THRESHOLDS.SYSTOLIC_BP.CRITICAL_HIGH,
    },
    diastolic_bp: {
      min: custom.diastolic_bp_min ?? THRESHOLDS.DIASTOLIC_BP.MIN,
      max: custom.diastolic_bp_max ?? THRESHOLDS.DIASTOLIC_BP.MAX,
    },
    temperature: {
      min: custom.temp_min ?? THRESHOLDS.TEMPERATURE.MIN,
      max: custom.temp_max ?? THRESHOLDS.TEMPERATURE.MAX,
      critical_low: custom.temp_critical_low ?? THRESHOLDS.TEMPERATURE.CRITICAL_LOW,
      critical_high: custom.temp_critical_high ?? THRESHOLDS.TEMPERATURE.CRITICAL_HIGH,
    },
  };
};

const detectRuleBasedAlerts = (reading, thresholds) => {
  const alerts = [];

  // SOS / Fall
  if (reading.sos_triggered) {
    alerts.push({
      type: ALERT_TYPES.MANUAL_SOS,
      severity: ALERT_SEVERITY.CRITICAL,
      title: 'Manual SOS Alert',
      description: 'Elderly person manually triggered SOS button',
      value: true,
    });
  }

  if (reading.fall_detected) {
    alerts.push({
      type: ALERT_TYPES.FALL_DETECTED,
      severity: ALERT_SEVERITY.CRITICAL,
      title: 'Fall Detected',
      description: 'Accelerometer data indicates a fall event',
      value: true,
    });
  }

  // Heart Rate
  if (reading.heart_rate !== null && reading.heart_rate !== undefined) {
    const hr = reading.heart_rate;
    if (hr <= thresholds.heart_rate.critical_low) {
      alerts.push({
        type: ALERT_TYPES.CARDIAC_ARREST,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'Critical Low Heart Rate — Possible Cardiac Arrest',
        description: `Heart rate is dangerously low at ${hr} BPM (threshold: ${thresholds.heart_rate.critical_low})`,
        value: hr,
      });
    } else if (hr >= thresholds.heart_rate.critical_high) {
      alerts.push({
        type: ALERT_TYPES.HEART_ATTACK,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'Critical High Heart Rate — Possible Heart Attack',
        description: `Heart rate critically elevated at ${hr} BPM (threshold: ${thresholds.heart_rate.critical_high})`,
        value: hr,
      });
    } else if (hr < thresholds.heart_rate.min || hr > thresholds.heart_rate.max) {
      const isHigh = hr > thresholds.heart_rate.max;
      alerts.push({
        type: ALERT_TYPES.ABNORMAL_HEART_RATE,
        severity: isHigh && hr > 120 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM,
        title: `Abnormal Heart Rate (${isHigh ? 'High' : 'Low'})`,
        description: `Heart rate of ${hr} BPM is outside normal range (${thresholds.heart_rate.min}-${thresholds.heart_rate.max})`,
        value: hr,
      });
    }

    // Panic detection: sudden spike + elevated reading
    if (hr >= THRESHOLDS.HEART_RATE.PANIC_PATTERN_THRESHOLD) {
      alerts.push({
        type: ALERT_TYPES.PANIC,
        severity: ALERT_SEVERITY.HIGH,
        title: 'Possible Panic / Extreme Stress',
        description: `Rapid heart rate of ${hr} BPM may indicate panic or extreme distress`,
        value: hr,
      });
    }
  }

  // SpO2
  if (reading.spo2 !== null && reading.spo2 !== undefined) {
    const spo2 = reading.spo2;
    if (spo2 <= thresholds.spo2.critical) {
      alerts.push({
        type: ALERT_TYPES.LOW_SPO2,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'Critically Low Blood Oxygen',
        description: `SpO2 at ${spo2}% — immediate medical attention required (critical: ${thresholds.spo2.critical}%)`,
        value: spo2,
      });
    } else if (spo2 < thresholds.spo2.min) {
      alerts.push({
        type: ALERT_TYPES.LOW_SPO2,
        severity: ALERT_SEVERITY.HIGH,
        title: 'Low Blood Oxygen Saturation',
        description: `SpO2 at ${spo2}% is below normal range (${thresholds.spo2.min}%)`,
        value: spo2,
      });
    }
  }

  // Blood Pressure
  if (reading.systolic_bp !== null && reading.systolic_bp !== undefined) {
    const sys = reading.systolic_bp;
    const dia = reading.diastolic_bp;
    if (sys >= thresholds.systolic_bp.critical_high) {
      alerts.push({
        type: ALERT_TYPES.HIGH_BLOOD_PRESSURE,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'Hypertensive Crisis',
        description: `Systolic BP at ${sys} mmHg — hypertensive emergency (critical: ${thresholds.systolic_bp.critical_high})`,
        value: { systolic: sys, diastolic: dia },
      });
    } else if (sys > thresholds.systolic_bp.max || (dia && dia > thresholds.diastolic_bp.max)) {
      alerts.push({
        type: ALERT_TYPES.HIGH_BLOOD_PRESSURE,
        severity: ALERT_SEVERITY.HIGH,
        title: 'High Blood Pressure',
        description: `BP ${sys}/${dia} mmHg exceeds normal range`,
        value: { systolic: sys, diastolic: dia },
      });
    } else if (sys < thresholds.systolic_bp.min || (dia && dia < thresholds.diastolic_bp.min)) {
      alerts.push({
        type: ALERT_TYPES.LOW_BLOOD_PRESSURE,
        severity: ALERT_SEVERITY.HIGH,
        title: 'Low Blood Pressure (Hypotension)',
        description: `BP ${sys}/${dia} mmHg is below normal — risk of fainting`,
        value: { systolic: sys, diastolic: dia },
      });
    }
  }

  // Temperature
  if (reading.temperature !== null && reading.temperature !== undefined) {
    const temp = reading.temperature;
    if (temp <= thresholds.temperature.critical_low) {
      alerts.push({
        type: ALERT_TYPES.LOW_TEMPERATURE,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'Critical Hypothermia',
        description: `Body temperature dangerously low at ${temp}°C`,
        value: temp,
      });
    } else if (temp >= thresholds.temperature.critical_high) {
      alerts.push({
        type: ALERT_TYPES.HIGH_TEMPERATURE,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'Critical Hyperthermia / High Fever',
        description: `Body temperature critically high at ${temp}°C`,
        value: temp,
      });
    } else if (temp < thresholds.temperature.min) {
      alerts.push({
        type: ALERT_TYPES.LOW_TEMPERATURE,
        severity: ALERT_SEVERITY.MEDIUM,
        title: 'Low Body Temperature',
        description: `Temperature at ${temp}°C is below normal range`,
        value: temp,
      });
    } else if (temp > thresholds.temperature.max) {
      alerts.push({
        type: ALERT_TYPES.HIGH_TEMPERATURE,
        severity: ALERT_SEVERITY.HIGH,
        title: 'High Fever',
        description: `Temperature at ${temp}°C indicates significant fever`,
        value: temp,
      });
    }
  }

  // Detect potential death: no vitals + no movement for extended period
  const allVitalsNull =
    reading.heart_rate == null && reading.spo2 == null && reading.temperature == null;
  if (allVitalsNull && reading.fall_detected) {
    alerts.push({
      type: ALERT_TYPES.POTENTIAL_DEATH,
      severity: ALERT_SEVERITY.CRITICAL,
      title: 'EMERGENCY: No Vitals Detected After Fall',
      description: 'No vital signs detected following a fall event — immediate response required',
      value: null,
    });
  }

  return alerts;
};

const computeAnomalyScore = (reading, alerts, recentReadings) => {
  let score = 0;

  for (const alert of alerts) {
    if (alert.severity === ALERT_SEVERITY.CRITICAL) score += 40;
    else if (alert.severity === ALERT_SEVERITY.HIGH) score += 25;
    else if (alert.severity === ALERT_SEVERITY.MEDIUM) score += 15;
    else score += 5;
  }

  // Bonus score for trend anomaly
  if (recentReadings.length >= 3 && reading.heart_rate) {
    const avgHR = recentReadings.reduce((s, r) => s + (r.heart_rate || 0), 0) / recentReadings.length;
    const deviation = Math.abs(reading.heart_rate - avgHR);
    if (deviation > 30) score += 15;
    else if (deviation > 15) score += 8;
  }

  return Math.min(100, score);
};

const determineHealthStatus = (anomalyScore, alerts) => {
  if (alerts.some((a) => a.severity === ALERT_SEVERITY.CRITICAL)) return HEALTH_STATUS.CRITICAL;
  if (anomalyScore >= 50) return HEALTH_STATUS.CRITICAL;
  if (anomalyScore >= 25) return HEALTH_STATUS.WARNING;
  return HEALTH_STATUS.NORMAL;
};

const getAIAssessment = async (reading, elderlyProfile, alerts, recentReadings) => {
  try {
    const alertSummary = alerts.map((a) => `- ${a.title}: ${a.description}`).join('\n');
    const recentSummary =
      recentReadings.slice(0, 5).map((r) =>
        `HR:${r.heart_rate ?? 'N/A'} SpO2:${r.spo2 ?? 'N/A'}% BP:${r.systolic_bp ?? 'N/A'}/${r.diastolic_bp ?? 'N/A'} Temp:${r.temperature ?? 'N/A'}°C`
      ).join(' | ');

    const prompt = `You are a medical AI assistant for an elderly health monitoring system. Analyze this health data and provide a brief clinical assessment.

PATIENT INFO:
- Age: ${elderlyProfile?.getAge?.() ?? 'Unknown'}
- Gender: ${elderlyProfile?.gender ?? 'Unknown'}
- Medical Conditions: ${(elderlyProfile?.medical_conditions ?? []).join(', ') || 'None recorded'}
- Blood Type: ${elderlyProfile?.blood_type ?? 'Unknown'}

CURRENT READINGS:
- Heart Rate: ${reading.heart_rate ?? 'N/A'} BPM
- SpO2: ${reading.spo2 ?? 'N/A'}%
- Blood Pressure: ${reading.systolic_bp ?? 'N/A'}/${reading.diastolic_bp ?? 'N/A'} mmHg
- Temperature: ${reading.temperature ?? 'N/A'}°C
- Fall Detected: ${reading.fall_detected ? 'YES' : 'No'}
- SOS Triggered: ${reading.sos_triggered ? 'YES' : 'No'}

TRIGGERED ALERTS:
${alertSummary || 'None'}

RECENT READINGS (last 5):
${recentSummary || 'No prior data'}

Provide a concise assessment (3-4 sentences) covering:
1. Likely clinical interpretation of the readings
2. Immediate risk level and recommended action
3. Whether emergency services should be contacted`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: 'You are a clinical health monitoring AI. Be precise, urgent, and medically accurate. Never be dismissive of critical readings.',
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0]?.text ?? null;
  } catch (err) {
    logger.error('AI assessment failed:', err.message);
    return null;
  }
};

/**
 * Generate AI health summary for a report period.
 */
const generateReportSummary = async (elderlyProfile, stats, alertsSummary, period) => {
  try {
    const prompt = `Generate a concise health report summary (4-5 sentences) for an elderly patient.

PATIENT: Age ${elderlyProfile.getAge?.() ?? 'Unknown'}, ${elderlyProfile.gender}, Conditions: ${(elderlyProfile.medical_conditions ?? []).join(', ') || 'None'}

PERIOD: ${period.start} to ${period.end}

VITAL STATISTICS:
- Heart Rate: avg ${stats.heart_rate?.avg?.toFixed(1) ?? 'N/A'} BPM (range: ${stats.heart_rate?.min ?? 'N/A'}-${stats.heart_rate?.max ?? 'N/A'})
- SpO2: avg ${stats.spo2?.avg?.toFixed(1) ?? 'N/A'}%
- Blood Pressure: avg ${stats.systolic_bp?.avg?.toFixed(0) ?? 'N/A'}/${stats.diastolic_bp?.avg?.toFixed(0) ?? 'N/A'} mmHg
- Temperature: avg ${stats.temperature?.avg?.toFixed(1) ?? 'N/A'}°C
- Total Readings: ${stats.readings_count ?? 0}

ALERTS: ${alertsSummary.total ?? 0} total (${alertsSummary.critical ?? 0} critical, ${alertsSummary.high ?? 0} high)

Provide: overall health assessment, notable patterns, recommendations for care team.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: 'You are a healthcare monitoring AI generating periodic health reports for elderly patients. Be thorough but concise.',
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0]?.text ?? null;
  } catch (err) {
    logger.error('Report AI summary failed:', err.message);
    return null;
  }
};

module.exports = { analyzeReading, generateReportSummary };
