const express = require('express');
const { loginWithGoogle } = require('./auth.service');
const { requireSession } = require('../shared/requireSession');
const { sendRouteError } = require('../shared/errors');
const { fambanRateLimiter } = require('../shared/rateLimiters');

const router = express.Router();

// Not gated by requireSession - this *is* how a session gets created.
router.post('/google', fambanRateLimiter, async (req, res) => {
  try {
    const { credential } = req.body;
    const { token, user } = await loginWithGoogle(credential);

    return res.status(200).json({
      message: 'Logged in successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
      },
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to log in with Google');
  }
});

router.get('/me', fambanRateLimiter, requireSession, (req, res) => {
  return res.status(200).json({ user: req.fambanUser });
});

module.exports = router;
