const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { REPORT_TYPE } = require('../utils/constants');

const Report = sequelize.define(
  'Report',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    elderly_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'elderly_profiles', key: 'id' },
    },
    generated_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    report_type: {
      type: DataTypes.ENUM(...Object.values(REPORT_TYPE)),
      defaultValue: REPORT_TYPE.THIRTY_MINUTE,
    },
    period_start: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    period_end: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    // Aggregated Vital Stats
    stats: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: `{
        heart_rate: { avg, min, max, readings_count },
        systolic_bp: { avg, min, max },
        diastolic_bp: { avg, min, max },
        spo2: { avg, min, max },
        temperature: { avg, min, max },
        steps_total: number,
        activity_summary: {}
      }`,
    },
    // Alert Summary
    alerts_summary: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ total, by_severity, by_type, critical_events: [] }',
    },
    // Overall Assessment
    overall_status: {
      type: DataTypes.ENUM('excellent', 'good', 'fair', 'poor', 'critical'),
      allowNull: true,
    },
    health_trend: {
      type: DataTypes.ENUM('improving', 'stable', 'declining', 'fluctuating', 'unknown'),
      defaultValue: 'unknown',
    },
    total_readings: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    anomaly_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    ai_summary: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AI-generated health narrative',
    },
    recommendations: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    notable_events: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    is_auto_generated: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'reports',
    indexes: [
      { fields: ['elderly_id'] },
      { fields: ['report_type'] },
      { fields: ['period_start'] },
      { fields: ['period_end'] },
      { fields: ['elderly_id', 'period_start'] },
    ],
  }
);

module.exports = Report;
