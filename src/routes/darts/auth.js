function requireApiKey(req, res, next) {
  const providedApiKey = req.header('x-api-key');

  if (!process.env.DARTS_API_KEY) {
    console.error('DARTS_API_KEY is not configured');

    return res.status(500).json({
      error: 'SERVER_MISCONFIGURED',
      message: 'API key authentication is not configured',
    });
  }

  if (!providedApiKey || providedApiKey !== process.env.DARTS_API_KEY) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or missing API key',
    });
  }

  return next();
}

module.exports = {
  requireApiKey,
};
