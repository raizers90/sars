const User = require('./User');
const ElderlyProfile = require('./ElderlyProfile');
const HealthReading = require('./HealthReading');
const Alert = require('./Alert');
const Report = require('./Report');
const GuardianElderly = require('./GuardianElderly');
const AuditLog = require('./AuditLog');

// User -> ElderlyProfile (1:1)
User.hasOne(ElderlyProfile, { foreignKey: 'user_id', as: 'elderlyProfile' });
ElderlyProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ElderlyProfile -> HealthReadings (1:N)
ElderlyProfile.hasMany(HealthReading, { foreignKey: 'elderly_id', as: 'healthReadings' });
HealthReading.belongsTo(ElderlyProfile, { foreignKey: 'elderly_id', as: 'elderlyProfile' });

// ElderlyProfile -> Alerts (1:N)
ElderlyProfile.hasMany(Alert, { foreignKey: 'elderly_id', as: 'alerts' });
Alert.belongsTo(ElderlyProfile, { foreignKey: 'elderly_id', as: 'elderlyProfile' });

// HealthReading -> Alert (1:N)
HealthReading.hasMany(Alert, { foreignKey: 'reading_id', as: 'alerts' });
Alert.belongsTo(HealthReading, { foreignKey: 'reading_id', as: 'healthReading' });

// ElderlyProfile -> Reports (1:N)
ElderlyProfile.hasMany(Report, { foreignKey: 'elderly_id', as: 'reports' });
Report.belongsTo(ElderlyProfile, { foreignKey: 'elderly_id', as: 'elderlyProfile' });

// Guardian <-> Elderly (M:N via GuardianElderly)
User.belongsToMany(ElderlyProfile, {
  through: GuardianElderly,
  foreignKey: 'guardian_id',
  otherKey: 'elderly_id',
  as: 'wardProfiles',
});
ElderlyProfile.belongsToMany(User, {
  through: GuardianElderly,
  foreignKey: 'elderly_id',
  otherKey: 'guardian_id',
  as: 'guardians',
});

// Registered by
User.hasMany(ElderlyProfile, { foreignKey: 'registered_by', as: 'registeredElderly' });
ElderlyProfile.belongsTo(User, { foreignKey: 'registered_by', as: 'registrar' });

// Alert acknowledgement
User.hasMany(Alert, { foreignKey: 'acknowledged_by', as: 'acknowledgedAlerts' });
User.hasMany(Alert, { foreignKey: 'resolved_by', as: 'resolvedAlerts' });

module.exports = {
  User,
  ElderlyProfile,
  HealthReading,
  Alert,
  Report,
  GuardianElderly,
  AuditLog,
};
