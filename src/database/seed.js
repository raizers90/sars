require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { User, ElderlyProfile, GuardianElderly } = require('../models/index');
const logger = require('../utils/logger');

const seed = async () => {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  // Admin
  const [admin] = await User.findOrCreate({
    where: { email: 'admin@sars.com' },
    defaults: {
      name: 'System Administrator',
      email: 'admin@sars.com',
      password_hash: await bcrypt.hash('Admin@1234', 12),
      role: 'admin',
      phone: '+1-555-0001',
      is_active: true,
    },
  });

  // Management
  const [mgmt] = await User.findOrCreate({
    where: { email: 'management@sars.com' },
    defaults: {
      name: 'Care Manager',
      email: 'management@sars.com',
      password_hash: await bcrypt.hash('Mgmt@1234', 12),
      role: 'management',
      phone: '+1-555-0002',
      is_active: true,
    },
  });

  // Guardian
  const [guardian] = await User.findOrCreate({
    where: { email: 'guardian@sars.com' },
    defaults: {
      name: 'John Guardian',
      email: 'guardian@sars.com',
      password_hash: await bcrypt.hash('Guardian@1234', 12),
      role: 'guardian',
      phone: '+1-555-0003',
      is_active: true,
    },
  });

  // Elderly user
  const [elderlyUser] = await User.findOrCreate({
    where: { email: 'elderly@sars.com' },
    defaults: {
      name: 'Mary Johnson',
      email: 'elderly@sars.com',
      password_hash: await bcrypt.hash('Elderly@1234', 12),
      role: 'elderly',
      phone: '+1-555-0004',
      is_active: true,
    },
  });

  // Elderly profile
  const [elderlyProfile] = await ElderlyProfile.findOrCreate({
    where: { user_id: elderlyUser.id },
    defaults: {
      user_id: elderlyUser.id,
      date_of_birth: '1945-03-15',
      gender: 'female',
      blood_type: 'O+',
      height_cm: 162,
      weight_kg: 65,
      medical_conditions: ['Hypertension', 'Type 2 Diabetes', 'Arthritis'],
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'twice daily', time: '08:00,20:00' },
        { name: 'Lisinopril', dosage: '10mg', frequency: 'once daily', time: '08:00' },
      ],
      allergies: ['Penicillin'],
      emergency_contact_name: 'John Guardian',
      emergency_contact_phone: '+1-555-0003',
      emergency_contact_relation: 'Son',
      room_number: 'A-101',
      device_id: 'WB-DEMO-001',
      device_type: 'wristband',
      registered_by: mgmt.id,
      health_status: 'normal',
    },
  });

  // Link guardian to elderly
  await GuardianElderly.findOrCreate({
    where: { guardian_id: guardian.id, elderly_id: elderlyProfile.id },
    defaults: {
      guardian_id: guardian.id,
      elderly_id: elderlyProfile.id,
      relationship: 'son',
      is_primary: true,
      assigned_by: mgmt.id,
    },
  });

  logger.info('Seed data created successfully');
  logger.info('Credentials:');
  logger.info('  Admin       → admin@sars.com / Admin@1234');
  logger.info('  Management  → management@sars.com / Mgmt@1234');
  logger.info('  Guardian    → guardian@sars.com / Guardian@1234');
  logger.info('  Elderly     → elderly@sars.com / Elderly@1234');
  logger.info('  Device Key  → WB-DEMO-001 (use as device_id in readings)');
  process.exit(0);
};

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
