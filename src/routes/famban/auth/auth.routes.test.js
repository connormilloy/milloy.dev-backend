const express = require('express');
const request = require('supertest');

jest.mock('./auth.service');
const authService = require('./auth.service');

const { createSessionToken } = require('../shared/session');
const authRouter = require('./auth');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/famban/auth', authRouter);
  return app;
}

describe('auth router', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, FAMBAN_SESSION_SECRET: 'test-secret' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('POST /auth/google forwards the credential and returns a token + user', async () => {
    authService.loginWithGoogle.mockResolvedValue({
      token: 'signed-token',
      user: { _id: '1', name: 'Connor', email: 'connor@example.com' },
    });

    const res = await request(buildApp())
      .post('/api/famban/auth/google')
      .send({ credential: 'google-id-token' });

    expect(res.status).toBe(200);
    expect(authService.loginWithGoogle).toHaveBeenCalledWith('google-id-token');
    expect(res.body).toEqual({
      message: 'Logged in successfully',
      token: 'signed-token',
      user: { _id: '1', name: 'Connor', email: 'connor@example.com' },
    });
  });

  test('POST /auth/google translates a service error to its status/code', async () => {
    const err = new Error('This Google account is not authorized for Famban');
    err.code = 'ACCOUNT_NOT_AUTHORIZED';
    err.status = 403;
    authService.loginWithGoogle.mockRejectedValue(err);

    const res = await request(buildApp())
      .post('/api/famban/auth/google')
      .send({ credential: 'google-id-token' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'ACCOUNT_NOT_AUTHORIZED',
      message: 'This Google account is not authorized for Famban',
    });
  });

  test('GET /auth/me requires a session', async () => {
    const res = await request(buildApp()).get('/api/famban/auth/me');

    expect(res.status).toBe(401);
  });

  test('GET /auth/me returns the decoded session for a valid token', async () => {
    const token = createSessionToken({
      userId: '1',
      email: 'connor@example.com',
    });

    const res = await request(buildApp())
      .get('/api/famban/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      userId: '1',
      email: 'connor@example.com',
    });
  });
});
