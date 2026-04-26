const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { HEALTH_STATUS } = require('../utils/constants');

const HealthReading = sequelize.define(
  'HealthReading',
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
    device_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    // Vital Signs
    heart_rate: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'BPM',
    },
    systolic_bp: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'mmHg',
    },
    diastolic_bp: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'mmHg',
    },
    spo2: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Blood oxygen saturation %',
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Body temperature Celsius',
    },
    respiratory_rate: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Breaths per minute',
    },
    // Movement & Activity
    steps: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    activity_level: {
      type: DataTypes.ENUM('sedentary', 'light', 'moderate', 'vigorous'),
      allowNull: true,
    },
    accelerometer_x: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    accelerometer_y: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    accelerometer_z: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    // Alert Flags
    fall_detected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sos_triggered: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Analysis Result
    health_status: {
      type: DataTypes.ENUM(...Object.values(HEALTH_STATUS)),
      defaultValue: HEALTH_STATUS.NORMAL,
    },
    anomaly_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: '0-100 AI-computed risk score',
    },
    ai_analysis: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'AI health analysis result',
    },
    alerts_triggered: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    // Device Metadata
    battery_level: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Device battery %',
    },
    signal_strength: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'RSSI dBm',
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
    reading_timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Actual time of reading from device',
    },
    raw_data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: 'health_readings',
    indexes: [
      { fields: ['elderly_id'] },
      { fields: ['device_id'] },
      { fields: ['reading_timestamp'] },
      { fields: ['health_status'] },
      { fields: ['fall_detected'] },
      { fields: ['sos_triggered'] },
      { fields: ['elderly_id', 'reading_timestamp'] },
    ],
  }
);

module.exports = HealthReading;
