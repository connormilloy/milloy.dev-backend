const express = require('express');
const { validateParameters } = require('./utils/middlewares');
const { strictRateLimiter } = require('../../utils/rateLimiters');
const { findUpcomingDepartures } = require('./utils/railUtils');
const { findStationByQuery } = require('./utils/stationUtils');

const router = express.Router();

router.get(
  '/get-next-departures/:origin/:destination/:numDepartures',
  validateParameters,
  strictRateLimiter,
  async (req, res) => {
    const { origin, destination, numDepartures } = req.params;
    try {
      const departures = await findUpcomingDepartures(
        origin,
        destination,
        numDepartures
      );

      res.json(departures);
    } catch (error) {
      console.log(error);
      res.status(500).json({
        response: 'Failed to fetch next departure.',
        message: error.message,
      });
    }
  }
);

router.get('/get-stations', (req, res) => {
  const query = (req.query.q || '').trim();

  if (!query || query.length < 2) {
    return res.station(400).json({
      error: 'Query must be at least 2 characters long.',
    });
  }

  const results = findStationByQuery(query);
  res.json(results);
});

module.exports = router;
