const express = require('express');
const { validateParameters } = require('./utils/middlewares');
const router = express.Router();
router.get(
  '/get-next-from-origin-destination/:origin/:destination',
  validateParameters,
  (req, res) => {
    const { origin, destination } = req.params;

    // Simulate fetching train data
    const trainData = {
      origin,
      destination,
      nextTrain: '12:30 PM',
      duration: '1 hour 15 minutes',
      price: '£25.00',
    };

    res.json(trainData);
  }
);

module.exports = router;
