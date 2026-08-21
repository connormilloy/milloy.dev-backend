const { OAuth2Client } = require('google-auth-library');
const { getDb } = require('../../../database/mongo');
const { createAppError } = require('../shared/errors');
const { createSessionToken } = require('../shared/session');
const { USERS_COLLECTION } = require('../shared/collections');

function usersCollection() {
  return getDb().collection(USERS_COLLECTION);
}

function getGoogleClient() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw createAppError(
      'Google sign-in is not configured',
      'SERVER_MISCONFIGURED',
      500
    );
  }

  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}

async function verifyGoogleIdToken(idToken) {
  if (!idToken) {
    throw createAppError(
      'Missing Google credential',
      'GOOGLE_CREDENTIAL_REQUIRED',
      400
    );
  }

  const client = getGoogleClient();
  let ticket;

  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    console.error('Google ID token verification failed:', err);
    throw createAppError(
      'Invalid Google credential',
      'INVALID_GOOGLE_CREDENTIAL',
      401
    );
  }

  const payload = ticket.getPayload();

  if (!payload || !payload.email_verified) {
    throw createAppError(
      'Google account email is not verified',
      'GOOGLE_EMAIL_UNVERIFIED',
      401
    );
  }

  return payload;
}

// Verifies the Google credential, then requires the email to already
// belong to an active famban-users record - there is no auto-provisioning
// from an arbitrary Google login. New family members are added via
// POST /users by someone who's already signed in (or the bootstrap seed
// script for the very first account).
async function loginWithGoogle(idToken) {
  const payload = await verifyGoogleIdToken(idToken);
  const email = payload.email.toLowerCase();

  const user = await usersCollection().findOne({ email, active: true });

  if (!user) {
    throw createAppError(
      'This Google account is not authorized for Famban',
      'ACCOUNT_NOT_AUTHORIZED',
      403
    );
  }

  // Keep the stored avatar in sync with Google on every login, so a
  // changed profile photo shows up without any dedicated update flow.
  const avatarUrl = payload.picture || null;
  if (avatarUrl !== (user.avatarUrl || null)) {
    await usersCollection().updateOne(
      { _id: user._id },
      { $set: { avatarUrl, updatedAt: new Date() } }
    );
    user.avatarUrl = avatarUrl;
  }

  const token = createSessionToken({
    userId: user._id.toHexString(),
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl || null,
  });

  return { token, user };
}

module.exports = { loginWithGoogle, verifyGoogleIdToken };
