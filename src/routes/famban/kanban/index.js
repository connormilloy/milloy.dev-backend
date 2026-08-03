const express = require('express');
const boards = require('./boards');
const cards = require('./cards');

const router = express.Router();

router.use('/boards', boards);
router.use('/cards', cards);

module.exports = router;
