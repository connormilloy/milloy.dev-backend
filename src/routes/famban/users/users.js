const express = require('express');
const { listUsers, createUser, updateUser } = require('./users.service');
const { requireApiKey } = require('../shared/auth');
const { sendRouteError } = require('../shared/errors');
const { fambanRateLimiter } = require('../shared/rateLimiters');

const router = express.Router();

router.get('/', fambanRateLimiter, async (req, res) => {
  try {
    const users = await listUsers();

    return res.status(200).json({ count: users.length, users });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch users');
  }
});

router.post('/', fambanRateLimiter, requireApiKey, async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await createUser({ name, email });

    return res.status(201).json({ message: 'User created successfully', user });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to create user');
  }
});

router.patch('/:id', fambanRateLimiter, requireApiKey, async (req, res) => {
  try {
    const { name, email, active } = req.body;
    const user = await updateUser(req.params.id, { name, email, active });

    return res.status(200).json({ message: 'User updated successfully', user });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to update user');
  }
});

module.exports = router;
