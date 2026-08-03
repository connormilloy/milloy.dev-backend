const { ObjectId } = require('mongodb');
const { createMockCollection } = require('../shared/testUtils');

jest.mock('google-auth-library');
jest.mock('../../../database/mongo');

const { OAuth2Client } = require('google-auth-library');
const { getDb } = require('../../../database/mongo');

const { loginWithGoogle, verifyGoogleIdToken } = require('./auth.service');

describe('auth.service', () => {
  let usersCollection;
  let verifyIdToken;
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      GOOGLE_CLIENT_ID: 'test-client-id',
      FAMBAN_SESSION_SECRET: 'test-secret',
    };

    usersCollection = createMockCollection();
    getDb.mockReturnValue({
      collection: jest.fn().mockReturnValue(usersCollection),
    });

    verifyIdToken = jest.fn();
    OAuth2Client.mockImplementation(() => ({ verifyIdToken }));
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('verifyGoogleIdToken', () => {
    test('throws GOOGLE_CREDENTIAL_REQUIRED when no token is given', async () => {
      await expect(verifyGoogleIdToken(undefined)).rejects.toMatchObject({
        code: 'GOOGLE_CREDENTIAL_REQUIRED',
        status: 400,
      });
    });

    test('throws SERVER_MISCONFIGURED when GOOGLE_CLIENT_ID is unset', async () => {
      delete process.env.GOOGLE_CLIENT_ID;

      await expect(verifyGoogleIdToken('token')).rejects.toMatchObject({
        code: 'SERVER_MISCONFIGURED',
        status: 500,
      });
    });

    test('throws INVALID_GOOGLE_CREDENTIAL when Google rejects the token', async () => {
      verifyIdToken.mockRejectedValue(new Error('bad signature'));

      await expect(verifyGoogleIdToken('token')).rejects.toMatchObject({
        code: 'INVALID_GOOGLE_CREDENTIAL',
        status: 401,
      });
    });

    test('throws GOOGLE_EMAIL_UNVERIFIED when the email is not verified', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'x@example.com', email_verified: false }),
      });

      await expect(verifyGoogleIdToken('token')).rejects.toMatchObject({
        code: 'GOOGLE_EMAIL_UNVERIFIED',
        status: 401,
      });
    });

    test('returns the payload for a valid, verified token', async () => {
      const payload = {
        email: 'x@example.com',
        email_verified: true,
        name: 'X',
      };
      verifyIdToken.mockResolvedValue({ getPayload: () => payload });

      await expect(verifyGoogleIdToken('token')).resolves.toEqual(payload);
    });
  });

  describe('loginWithGoogle', () => {
    test('throws ACCOUNT_NOT_AUTHORIZED when no matching active user exists', async () => {
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'stranger@example.com',
          email_verified: true,
        }),
      });
      usersCollection.findOne.mockResolvedValue(null);

      await expect(loginWithGoogle('token')).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_AUTHORIZED',
        status: 403,
      });
    });

    test('is case-insensitive on email and issues a session token for a matching active user', async () => {
      const user = {
        _id: new ObjectId(),
        name: 'Connor',
        email: 'connor@example.com',
      };
      verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'Connor@Example.com',
          email_verified: true,
        }),
      });
      usersCollection.findOne.mockResolvedValue(user);

      const result = await loginWithGoogle('token');

      expect(usersCollection.findOne).toHaveBeenCalledWith({
        email: 'connor@example.com',
        active: true,
      });
      expect(result.user).toEqual(user);
      expect(typeof result.token).toBe('string');
    });
  });
});
