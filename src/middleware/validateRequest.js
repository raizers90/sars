const { validationResult } = require('express-validator');
const { badRequest } = require('../utils/response');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return badRequest(res, 'Validation failed', formatted);
  }
  next();
};

module.exports = { validateRequest };
