const rateLimit = require('express-rate-limit');

// Verify that the station code conforms to the Common Reporting System (CRS) standard.
const validateStationCode = (code) => /^[A-Z]{3}$/.test(code);

const validateParameters = (req, res, next) => {
  const { origin, destination } = req.params;

  const validParams =
    validateStationCode(origin) && validateStationCode(destination);

  if (!validParams) {
    return res.status(400).json({
      error:
        'Parameters are not in expected format. Origin and Destination should conform with CRS - see http://www.railwaycodes.org.uk/stations/station1.shtm for more information.',
    });
  }
  next();
};

const strictRateLimiter = rateLimit({
  windowMs: 2000,
  max: 1,
  message: {
    error: 'Too many requests, please wait before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  validateParameters,
  strictRateLimiter,
};
