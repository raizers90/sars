const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { ALERT_TYPES, ALERT_SEVERITY, ALERT_STATUS } = require('../utils/constants');

const Alert = sequelize.define(
  'Alert',
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
    reading_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'health_readings', key: 'id' },
    },
    alert_type: {
      type: DataTypes.ENUM(...Object.values(ALERT_TYPES)),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM(...Object.values(ALERT_SEVERITY)),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(ALERT_STATUS)),
      defaultValue: ALERT_STATUS.ACTIVE,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    trigger_values: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'The health values that triggered this alert',
    },
    ai_assessment: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AI explanation of the alert',
    },
    notified_users: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
      comment: 'User IDs who received notifications',
    },
    acknowledged_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    acknowledged_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolved_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolution_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    escalated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    escalation_level: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    location: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    auto_generated: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'alerts',
    indexes: [
      { fields: ['elderly_id'] },
      { fields: ['alert_type'] },
      { fields: ['severity'] },
      { fields: ['status'] },
      { fields: ['elderly_id', 'status'] },
      { fields: ['created_at'] },
    ],
  }
);

module.exports = Alert;
