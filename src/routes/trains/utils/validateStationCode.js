// Verify that the station code conforms to the Common Reporting System (CRS) standard.
const validateStationCode = (code) => /^[A-Z]{3}$/.test(code);

module.exports = validateStationCode;