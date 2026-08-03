const express = require('express');
const users = require('./users');
const tags = require('./tags');
const kanban = require('./kanban');

// Famban is the umbrella for family-oriented tools. `users` and `tags` are
// shared across modules; `kanban` is the first one. Future modules (e.g.
// shopping-lists) mount alongside kanban here.
const router = express.Router();

router.use('/users', users);
router.use('/tags', tags);
router.use('/kanban', kanban);

module.exports = router;
