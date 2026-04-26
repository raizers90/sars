const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const GuardianElderly = sequelize.define(
  'GuardianElderly',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    guardian_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    elderly_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'elderly_profiles', key: 'id' },
    },
    relationship: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'e.g., son, daughter, spouse, caregiver',
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Primary guardian receives all alerts',
    },
    notification_preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        all_alerts: true,
        critical_only: false,
        reports: true,
        daily_summary: true,
      },
    },
    access_level: {
      type: DataTypes.ENUM('full', 'read_only', 'alerts_only'),
      defaultValue: 'full',
    },
    assigned_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'guardian_elderly',
    indexes: [
      { fields: ['guardian_id'] },
      { fields: ['elderly_id'] },
      { unique: true, fields: ['guardian_id', 'elderly_id'] },
    ],
  }
);

module.exports = GuardianElderly;
