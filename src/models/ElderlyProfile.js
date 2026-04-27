const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { HEALTH_STATUS } = require('../utils/constants');

const ElderlyProfile = sequelize.define(
  'ElderlyProfile',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    gender: {
      type: DataTypes.ENUM('male', 'female', 'other'),
      allowNull: false,
    },
    blood_type: {
      type: DataTypes.ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
      allowNull: true,
    },
    height_cm: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    weight_kg: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    medical_conditions: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    allergies: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    medications: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: '[{ name, dosage, frequency, time }]',
    },
    emergency_contact_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    emergency_contact_phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    emergency_contact_relation: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    room_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    registered_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    health_status: {
      type: DataTypes.ENUM(...Object.values(HEALTH_STATUS)),
      defaultValue: HEALTH_STATUS.UNKNOWN,
    },
    device_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Wristband/smartwatch device identifier',
    },
    device_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'e.g., wristband, smartwatch, sensor_patch',
    },
    device_last_seen: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_reading_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    custom_thresholds: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Override global thresholds for this elderly person',
    },
    photo_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'elderly_profiles',
    indexes: [
      { fields: ['user_id'] },
      { unique: true, fields: ['device_id'] },
      { fields: ['health_status'] },
      { fields: ['is_active'] },
    ],
  }
);

ElderlyProfile.prototype.getAge = function () {
  if (!this.date_of_birth) return null;
  const birth = new Date(this.date_of_birth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

module.exports = ElderlyProfile;
