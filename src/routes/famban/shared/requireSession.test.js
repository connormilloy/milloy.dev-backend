const { requireSession } = require('./requireSession');
const { createSessionToken } = require('./session');

function buildReqRes(authHeader) {
  const req = { header: jest.fn().mockReturnValue(authHeader) };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return { req, res };
}

describe('requireSession', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, FAMBAN_SESSION_SECRET: 'test-secret' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('401s when no Authorization header is present', () => {
    const { req, res } = buildReqRes(undefined);
    const next = jest.fn();

    requireSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401s when the header is not a Bearer scheme', () => {
    const { req, res } = buildReqRes('Basic somevalue');
    const next = jest.fn();

    requireSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401s for an invalid token', () => {
    const { req, res } = buildReqRes('Bearer garbage');
    const next = jest.fn();

    requireSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches the decoded session and calls next() for a valid token', () => {
    const token = createSessionToken({
      userId: '1',
      email: 'connor@example.com',
    });
    const { req, res } = buildReqRes(`Bearer ${token}`);
    const next = jest.fn();

    requireSession(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.fambanUser).toMatchObject({
      userId: '1',
      email: 'connor@example.com',
    });
    expect(res.status).not.toHaveBeenCalled();
  });
});
