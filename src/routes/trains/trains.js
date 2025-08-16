const express = require('express');
const { validateParameters } = require('./utils/middlewares');
const { strictRateLimiter } = require('../../utils/rateLimiters');
const { findUpcomingDepartures } = require('./utils/railAPI');

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

module.exports = router;
