const express = require('express');

const router = express.Router();

router.get('/stub', (req, res) => {
  res.send('stubbed /trains endpoint');
});


module.exports = router;
