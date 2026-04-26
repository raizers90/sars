const success = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  if (meta !== null) payload.meta = meta;
  return res.status(statusCode).json(payload);
};

const created = (res, data = null, message = 'Created successfully') =>
  success(res, data, message, 201);

const error = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const payload = { success: false, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

const badRequest = (res, message = 'Bad request', errors = null) =>
  error(res, message, 400, errors);

const unauthorized = (res, message = 'Unauthorized') => error(res, message, 401);

const forbidden = (res, message = 'Access denied') => error(res, message, 403);

const notFound = (res, message = 'Resource not found') => error(res, message, 404);

const conflict = (res, message = 'Resource already exists') => error(res, message, 409);

const paginate = (res, data, total, page, limit, message = 'Success') =>
  success(res, data, message, 200, {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit),
  });

module.exports = { success, created, error, badRequest, unauthorized, forbidden, notFound, conflict, paginate };
