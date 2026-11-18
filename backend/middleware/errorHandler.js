function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;
  const status = error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_UNEXPECTED_FILE' ? 400 : (Number(error.status) || 500);
  const message = error.code === 'LIMIT_FILE_SIZE' ? 'The uploaded file is too large.' : error.code === 'LIMIT_UNEXPECTED_FILE' ? 'Unexpected file upload.' : error.message;
  console.error(`${req.method} ${req.originalUrl}:`, error.code || `HTTP_${status}`);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : message });
}

module.exports = errorHandler;
