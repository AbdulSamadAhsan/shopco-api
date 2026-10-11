function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status : 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : error.message,
  });
}

module.exports = { errorHandler };
