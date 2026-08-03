function createAppError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sendRouteError(res, err, fallbackMessage = 'Something went wrong') {
  if (err && Number.isInteger(err.status)) {
    return res.status(err.status).json({
      error: err.code || 'REQUEST_FAILED',
      message: err.message || fallbackMessage,
    });
  }

  console.error(err);

  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
  });
}

module.exports = { createAppError, sendRouteError };
