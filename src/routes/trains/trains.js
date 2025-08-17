const express = require('express');
const { validateParameters } = require('./utils/middlewares');
const { strictRateLimiter } = require('../../utils/rateLimiters');
const { findUpcomingDepartures } = require('./utils/railUtils');
const { findStationByQuery } = require('./utils/stationUtils');
const { logWithTimestamp } = require('../../utils/logwithTimestamp');

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

      if (!departures) {
        res.status(200).json({
          success: true,
          message: `No upcoming departures found from ${origin} to ${destination}.`,
          response: [],
        });
      }

      res.status(200).json({
        success: true,
        message: `Upcoming departures from ${origin} to ${destination}.`,
        response: departures,
      });
    } catch (error) {
      logWithTimestamp(
        `Failed to fetch departures from ${origin} to ${destination}: ${error.message}`
      );

      res.status(500).json({
        success: false,
        message: `Failed to fetch upcoming departures - ${error.message}`,
        data: null,
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
