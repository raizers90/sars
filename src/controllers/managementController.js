const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, ElderlyProfile, HealthReading, Alert, Report, GuardianElderly } = require('../models/index');
const { success, created, badRequest, notFound, conflict, paginate } = require('../utils/response');
const { generateReport } = require('../services/reportService');
const { REPORT_TYPE } = require('../utils/constants');

// Register a new elderly person
const registerElderly = async (req, res) => {
  const {
    name, email, date_of_birth, gender, blood_type, height_cm, weight_kg,
    medical_conditions, allergies, medications, emergency_contact_name,
    emergency_contact_phone, emergency_contact_relation, room_number, address,
    notes, device_id, device_type, guardian_ids, custom_thresholds,
  } = req.body;

  // Check device_id uniqueness
  if (device_id) {
    const existing = await ElderlyProfile.findOne({ where: { device_id } });
    if (existing) return conflict(res, 'Device ID already registered');
  }

  // Create user account for elderly
  const elderlyUser = await User.create({
    name,
    email: email || null,
    password_hash: email ? await bcrypt.hash(`Temp@${Date.now()}`, 12) : null,
    role: 'elderly',
    is_active: true,
  });

  // Create elderly profile
  const profile = await ElderlyProfile.create({
    user_id: elderlyUser.id,
    date_of_birth,
    gender,
    blood_type,
    height_cm,
    weight_kg,
    medical_conditions: medical_conditions || [],
    allergies: allergies || [],
    medications: medications || [],
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relation,
    room_number,
    address,
    notes,
    device_id,
    device_type,
    custom_thresholds: custom_thresholds || {},
    registered_by: req.user.id,
    health_status: 'unknown',
  });

  // Assign guardians if provided
  if (guardian_ids && guardian_ids.length > 0) {
    for (const [index, guardianId] of guardian_ids.entries()) {
      const guardian = await User.findOne({ where: { id: guardianId, role: 'guardian', is_active: true } });
      if (guardian) {
        await GuardianElderly.create({
          guardian_id: guardianId,
          elderly_id: profile.id,
          is_primary: index === 0,
          assigned_by: req.user.id,
        });
      }
    }
  }

  const fullProfile = await ElderlyProfile.findByPk(profile.id, {
    include: [
      { model: User, as: 'user', attributes: { exclude: ['password_hash'] } },
      { model: User, as: 'guardians', attributes: ['id', 'name', 'email', 'phone'] },
    ],
  });

  created(res, fullProfile, 'Elderly person registered successfully');
};

// List all elderly
const listElderly = async (req, res) => {
  const { page = 1, limit = 20, search, health_status, room_number } = req.query;
  const where = { is_active: true };
  if (health_status) where.health_status = health_status;
  if (room_number) where.room_number = room_number;

  const include = [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }];

  if (search) {
    include[0].where = { name: { [Op.iLike]: `%${search}%` } };
  }

  const { count, rows } = await ElderlyProfile.findAndCountAll({
    where,
    include,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['created_at', 'DESC']],
  });

  paginate(res, rows, count, page, limit);
};

// Get single elderly profile
const getElderly = async (req, res) => {
  const profile = await ElderlyProfile.findByPk(req.params.id, {
    include: [
      { model: User, as: 'user', attributes: { exclude: ['password_hash'] } },
      { model: User, as: 'guardians', attributes: ['id', 'name', 'email', 'phone'] },
      { model: User, as: 'registrar', attributes: ['id', 'name'] },
    ],
  });
  if (!profile) return notFound(res, 'Elderly profile not found');
  success(res, profile);
};

// Update elderly profile
const updateElderly = async (req, res) => {
  const profile = await ElderlyProfile.findByPk(req.params.id);
  if (!profile) return notFound(res, 'Elderly profile not found');

  const updatable = [
    'blood_type', 'height_cm', 'weight_kg', 'medical_conditions', 'allergies',
    'medications', 'emergency_contact_name', 'emergency_contact_phone',
    'emergency_contact_relation', 'room_number', 'address', 'notes',
    'device_id', 'device_type', 'custom_thresholds',
  ];

  const updates = {};
  for (const key of updatable) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  await profile.update(updates);
  success(res, profile, 'Profile updated');
};

// Assign guardian to elderly
const assignGuardian = async (req, res) => {
  const { elderly_id, guardian_id, relationship, is_primary } = req.body;

  const profile = await ElderlyProfile.findByPk(elderly_id);
  if (!profile) return notFound(res, 'Elderly profile not found');

  const guardian = await User.findOne({ where: { id: guardian_id, role: 'guardian', is_active: true } });
  if (!guardian) return notFound(res, 'Guardian not found');

  const existing = await GuardianElderly.findOne({ where: { guardian_id, elderly_id } });
  if (existing) {
    await existing.update({ relationship, is_primary: is_primary ?? existing.is_primary, is_active: true });
    return success(res, existing, 'Guardian assignment updated');
  }

  const assignment = await GuardianElderly.create({
    guardian_id,
    elderly_id,
    relationship,
    is_primary: is_primary ?? false,
    assigned_by: req.user.id,
  });

  success(res, assignment, 'Guardian assigned successfully');
};

// Reports
const getReports = async (req, res) => {
  const { elderly_id, page = 1, limit = 20, from, to, type } = req.query;
  const where = {};
  if (elderly_id) where.elderly_id = elderly_id;
  if (type) where.report_type = type;
  if (from || to) {
    where.period_start = {};
    if (from) where.period_start[Op.gte] = new Date(from);
    if (to) where.period_start[Op.lte] = new Date(to);
  }

  const { count, rows } = await Report.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['period_start', 'DESC']],
    include: [{ model: ElderlyProfile, as: 'elderlyProfile', include: [{ model: User, as: 'user', attributes: ['name'] }] }],
  });

  paginate(res, rows, count, page, limit);
};

const getReport = async (req, res) => {
  const report = await Report.findByPk(req.params.id, {
    include: [{ model: ElderlyProfile, as: 'elderlyProfile', include: [{ model: User, as: 'user', attributes: ['name'] }] }],
  });
  if (!report) return notFound(res, 'Report not found');
  success(res, report);
};

const generateManualReport = async (req, res) => {
  const { elderly_id, from, to } = req.body;
  if (!elderly_id || !from || !to) return badRequest(res, 'elderly_id, from, and to are required');

  const profile = await ElderlyProfile.findByPk(elderly_id);
  if (!profile) return notFound(res, 'Elderly profile not found');

  const report = await generateReport(elderly_id, new Date(from), new Date(to), REPORT_TYPE.MANUAL);
  if (!report) return badRequest(res, 'No data available for the specified period');

  created(res, report, 'Report generated successfully');
};

// Alerts management
const getAllAlerts = async (req, res) => {
  const { elderly_id, status, severity, page = 1, limit = 30, from, to } = req.query;
  const where = {};
  if (elderly_id) where.elderly_id = elderly_id;
  if (status) where.status = status;
  if (severity) where.severity = severity;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = new Date(from);
    if (to) where.created_at[Op.lte] = new Date(to);
  }

  const { count, rows } = await Alert.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['created_at', 'DESC']],
    include: [{ model: ElderlyProfile, as: 'elderlyProfile', include: [{ model: User, as: 'user', attributes: ['name', 'id'] }] }],
  });

  paginate(res, rows, count, page, limit);
};

module.exports = {
  registerElderly, listElderly, getElderly, updateElderly, assignGuardian,
  getReports, getReport, generateManualReport, getAllAlerts,
};
