const express = require('express');

const router = express.Router();

router.get('/route1', (req, res) => {
  res.send('route 1');
});

router.get('/route2', (req, res) => {
    res.send('route 2');
});

module.exports = router;
