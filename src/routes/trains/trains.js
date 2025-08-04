const express = require('express');
const {
  validateParameters,
  strictRateLimiter,
} = require('./utils/middlewares');
const { findNextSpecificDeparture } = require('./utils/railAPI');

const router = express.Router();
router.get(
  '/get-next-from-origin-destination/:origin/:destination',
  validateParameters,
  strictRateLimiter,
  async (req, res) => {
    const { origin, destination } = req.params;
    try {
      const nextDeparture = await findNextSpecificDeparture(
        origin,
        destination
      );
      res.json(nextDeparture);
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
