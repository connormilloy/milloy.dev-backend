const validateStationCode = require('./validateStationCode');
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

module.exports = {
  validateParameters,
};
