const express = require('express');

const router = express.Router();

router.get('/get-next-train-from-origin-to-destination/:origin/:destination', (req, res) => {
    const { origin, destination } = req.params;

    if (!origin || !destination) {
        return res.status(400).json({ error: 'Origin and destination are required.' });
    }

    // Simulate fetching train data
    const trainData = {
        origin,
        destination,
        nextTrain: '12:30 PM',
        duration: '1 hour 15 minutes',
        price: '£25.00',
    };

    res.json(trainData);
});


module.exports = router;
