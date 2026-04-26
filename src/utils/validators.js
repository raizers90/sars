const { body, param, query } = require('express-validator');

const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('role').isIn(['admin', 'management', 'guardian']).withMessage('Invalid role'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
];

const loginValidator = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const elderlyRegisterValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }),
  body('date_of_birth').isISO8601().withMessage('Valid date of birth required'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
  body('blood_type').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  body('medical_conditions').optional().isArray(),
  body('medications').optional().isArray(),
  body('emergency_contact_name').optional().trim().isLength({ max: 100 }),
  body('emergency_contact_phone').optional().isMobilePhone(),
  body('guardian_ids').optional().isArray(),
  body('room_number').optional().trim().isLength({ max: 20 }),
  body('address').optional().trim().isLength({ max: 255 }),
];

const healthReadingValidator = [
  body('heart_rate').optional().isFloat({ min: 0, max: 300 }).withMessage('Invalid heart rate'),
  body('systolic_bp').optional().isFloat({ min: 0, max: 300 }).withMessage('Invalid systolic BP'),
  body('diastolic_bp').optional().isFloat({ min: 0, max: 200 }).withMessage('Invalid diastolic BP'),
  body('spo2').optional().isFloat({ min: 0, max: 100 }).withMessage('Invalid SpO2'),
  body('temperature').optional().isFloat({ min: 30, max: 45 }).withMessage('Invalid temperature'),
  body('steps').optional().isInt({ min: 0 }),
  body('fall_detected').optional().isBoolean(),
  body('sos_triggered').optional().isBoolean(),
  body('activity_level').optional().isIn(['sedentary', 'light', 'moderate', 'vigorous']),
  body('device_id').notEmpty().withMessage('Device ID is required'),
  body('timestamp').optional().isISO8601(),
];

const paginationValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const uuidParamValidator = (field = 'id') => [
  param(field).isUUID().withMessage(`Invalid ${field}`),
];

const dateRangeValidator = [
  query('from').optional().isISO8601().withMessage('Invalid from date'),
  query('to').optional().isISO8601().withMessage('Invalid to date'),
];

module.exports = {
  registerValidator,
  loginValidator,
  elderlyRegisterValidator,
  healthReadingValidator,
  paginationValidator,
  uuidParamValidator,
  dateRangeValidator,
};
