const { createSessionToken, verifySessionToken } = require('./session');

describe('session', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, FAMBAN_SESSION_SECRET: 'test-secret' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('createSessionToken throws SERVER_MISCONFIGURED when the secret is unset', () => {
    delete process.env.FAMBAN_SESSION_SECRET;

    expect(() => createSessionToken({ userId: '1' })).toThrow(
      expect.objectContaining({ code: 'SERVER_MISCONFIGURED', status: 500 })
    );
  });

  test('round-trips a payload through create + verify', () => {
    const token = createSessionToken({
      userId: '1',
      email: 'connor@example.com',
    });
    const decoded = verifySessionToken(token);

    expect(decoded).toMatchObject({ userId: '1', email: 'connor@example.com' });
    expect(typeof decoded.exp).toBe('number');
  });

  test('verifySessionToken throws UNAUTHORIZED for a garbage token', () => {
    expect(() => verifySessionToken('not-a-real-token')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 })
    );
  });

  test('verifySessionToken throws UNAUTHORIZED for a token signed with a different secret', () => {
    const token = createSessionToken({ userId: '1' });

    process.env.FAMBAN_SESSION_SECRET = 'a-different-secret';

    expect(() => verifySessionToken(token)).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 })
    );
  });
});
