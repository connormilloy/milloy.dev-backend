const jwt = require('jsonwebtoken');
const { createAppError } = require('./errors');

const SESSION_TTL = '7d';

function getSecret() {
  const secret = process.env.FAMBAN_SESSION_SECRET;

  if (!secret) {
    throw createAppError(
      'Session signing is not configured',
      'SERVER_MISCONFIGURED',
      500
    );
  }

  return secret;
}

function createSessionToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: SESSION_TTL });
}

function verifySessionToken(token) {
  const secret = getSecret();

  try {
    return jwt.verify(token, secret);
  } catch (err) {
    throw createAppError('Invalid or expired session', 'UNAUTHORIZED', 401);
  }
}

module.exports = { createSessionToken, verifySessionToken };
